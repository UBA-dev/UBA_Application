import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../lib/firebaseAdmin";
import { hasFeatureAccess, AI_LOCKED_MESSAGE } from "../../lib/subscription";
import { requireSession } from "../../lib/apiAuth";
import { geminiUrl, fetchGeminiWithRetry } from "../../lib/geminiFetch";

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

    const { deviceInfo, issueDescription, inventoryItemNames } = await req.json();

    if (!deviceInfo || !issueDescription) {
      return NextResponse.json({ error: "Missing device info or issue description" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not set up" }, { status: 500 });
    }

    const inventoryHint = (inventoryItemNames || []).length > 0
      ? `\n\nThis shop's current inventory includes these items: ${inventoryItemNames.join(", ")}.\nWhen suggesting parts, prefer names that match or closely resemble these existing items. You may also suggest parts not in this list if genuinely needed — mark those separately.`
      : "";

    const prompt = `You are an experienced electronics/computer repair technician assisting a shop owner who just received a repair job.

Device: ${deviceInfo}
Reported issue: ${issueDescription}
${inventoryHint}

Based on common failure patterns for this type of device and issue, respond with ONLY this exact JSON shape:

{
  "possibleCauses": ["short cause 1", "short cause 2", "short cause 3"],
  "suggestedPartsInStock": ["exact item name from the inventory list, if applicable"],
  "suggestedPartsToOrder": ["part name not in current inventory, if needed"],
  "complexity": "Simple" | "Moderate" | "Complex",
  "estimatedHours": <number>,
  "diagnosticTip": "one short practical tip for the technician to check first"
}

Rules:
- possibleCauses: 2-4 most likely causes, ordered from most to least common. Keep each under 8 words.
- suggestedPartsInStock: only include names that closely match the provided inventory list. Empty array if none apply.
- suggestedPartsToOrder: parts likely needed but not found in inventory. Empty array if none.
- complexity: "Simple" = under 30 min, basic fix. "Moderate" = 30min-2hrs, some diagnostics needed. "Complex" = 2+ hrs, advanced diagnostics or specialized parts.
- estimatedHours: realistic number, can be decimal (e.g. 0.5, 1.5).
- Be practical and specific to the device type — don't give generic advice that applies to anything.

Respond ONLY with valid JSON. No markdown, no extra text.`;

    const response = await fetchGeminiWithRetry(geminiUrl(apiKey), {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json({ error: "UBA diagnosis failed" }, { status: 502 });
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

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("diagnose-repair error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}