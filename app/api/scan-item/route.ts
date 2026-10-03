import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../lib/firebaseAdmin";
import { hasFeatureAccess, AI_LOCKED_MESSAGE } from "../../lib/subscription";
import { requireSession } from "../../lib/apiAuth";
import { checkAndIncrementUsageServer } from "../../lib/usageLimitsAdmin";
import { usageLimitMessage } from "../../lib/usageLimits";
import { geminiUrl, fetchGeminiWithRetry } from "../../lib/geminiFetch";
import { buildScanPrompt, formatInventoryForScan } from "../../lib/scanPrompt";

// Inventory items sent to the AI for matching; plenty for a small shop and
// still a modest prompt.
const MAX_INVENTORY_FOR_MATCHING = 1500;
const CONTENT_UNITS = ["Kilogram", "Liter", "Piece", "Meter", "Gallon"];

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.session;

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenant = tenantSnap.exists ? tenantSnap.data() : null;
    if (!hasFeatureAccess(tenant, "aiFeatures")) {
      return NextResponse.json({ error: AI_LOCKED_MESSAGE }, { status: 403 });
    }

    const usage = await checkAndIncrementUsageServer(tenantId, "scanCount", tenant);
    if (!usage.allowed) {
      return NextResponse.json({ error: usageLimitMessage("scanCount", usage.limit) }, { status: 403 });
    }

    const body = await req.json();
    const { imageBase64, mimeType, textContent, existingCategories, existingSubCategories } = body;

    if (!imageBase64 && !textContent) {
      return NextResponse.json({ error: "No image or text provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not set up" }, { status: 500 });
    }

    // The shop's current inventory, so scanned lines can be matched to items
    // it already stocks (restock) instead of always becoming new items.
    const inventorySnap = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("inventory")
      .select("name", "category", "unit", "packSize", "packUnit", "aliases")
      .limit(MAX_INVENTORY_FOR_MATCHING)
      .get();
    const inventoryIds = new Set(inventorySnap.docs.map((d) => d.id));
    const basePrompt = buildScanPrompt({
      inventoryList: formatInventoryForScan(inventorySnap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      existingCategories,
      existingSubCategories,
    });

    const parts: any[] = [{ text: basePrompt }];

    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType || "image/jpeg",
          data: imageBase64,
        },
      });
    } else if (textContent) {
      const trimmed = textContent.length > 20000 ? textContent.slice(0, 20000) : textContent;
      parts.push({ text: `\n\nDocument content to analyze:\n"""\n${trimmed}\n"""` });
    }

    const response = await fetchGeminiWithRetry(geminiUrl(apiKey), {
      contents: [{ parts }],
      generationConfig: { response_mime_type: "application/json" },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json({ error: "UBA analysis failed" }, { status: 502 });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json({ error: "No result from UBA" }, { status: 502 });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Couldn't read UBA's answer" }, { status: 502 });
    }

    if (!Array.isArray(parsed.items)) {
      return NextResponse.json({ error: "Unexpected answer from UBA" }, { status: 502 });
    }

    // Keep only answers we can trust the shape of: a match must point at a
    // real item, and a pack size must be a positive amount in a stock unit.
    parsed.items = parsed.items.map((item: Record<string, unknown>) => {
      const matchedItemId =
        typeof item.matchedItemId === "string" && inventoryIds.has(item.matchedItemId) ? item.matchedItemId : null;
      const matchConfidence = typeof item.matchConfidence === "string" ? item.matchConfidence : "";
      const contentPerUnit = Number(item.contentPerUnit);
      const contentUnit = typeof item.contentUnit === "string" ? item.contentUnit : "";
      const contentOk = contentPerUnit > 0 && CONTENT_UNITS.includes(contentUnit);
      return {
        ...item,
        matchedItemId,
        matchConfidence: matchedItemId && ["high", "medium", "low"].includes(matchConfidence) ? matchConfidence : null,
        contentPerUnit: contentOk ? contentPerUnit : null,
        contentUnit: contentOk ? contentUnit : null,
        contentIsEstimate: contentOk && item.contentIsEstimate === true,
      };
    });

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("scan-item error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}