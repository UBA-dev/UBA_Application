import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../lib/firebaseAdmin";
import { hasFeatureAccess, AI_LOCKED_MESSAGE } from "../../lib/subscription";
import { requireSession } from "../../lib/apiAuth";
import { checkAndIncrementUsageServer } from "../../lib/usageLimitsAdmin";
import { usageLimitMessage } from "../../lib/usageLimits";
import { geminiUrl, fetchGeminiWithRetry } from "../../lib/geminiFetch";
import phProvinces from "../../../public/ph-locations/provinces.json";
import phCities from "../../../public/ph-locations/cities.json";

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

    const usage = await checkAndIncrementUsageServer(tenantId, "analysisCount", tenant);
    if (!usage.allowed) {
      return NextResponse.json({ error: usageLimitMessage("analysisCount", usage.limit) }, { status: 403 });
    }

    const {
      rangeLabel,
      comparison,
      topSellingItems,
      slowMovingItems,
      lowStockItems,
      categoryBreakdown,
      repairMetrics,
      currentMonth,
      marginAnalysis,
      commonIssues,
      periodSeries,
    } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not set up" }, { status: 500 });
    }

    // Resolve the shop's actual city/province (set in Settings > Business
    // Location) so the analysis is sized to a real place instead of a
    // generic assumption — a shop in a small town shouldn't get advice
    // written for a Metro Manila mall.
    const city = (phCities as { id: string; provinceId: string; name: string }[]).find(
      (c) => c.id === (tenant as any)?.businessCityId
    );
    const province = (phProvinces as { id: string; name: string }[]).find(
      (p) => p.id === (tenant as any)?.businessProvinceId
    );
    const locationLabel = city && province ? `${city.name}, ${province.name}` : null;

        const prompt = `You are a friendly helper for a small electronics repair/retail shop owner in the Philippines — a small local shop with mostly walk-in and regular customers, NOT a mall store or a big-city chain. The owner is busy, is not an accountant, and may not know business terms. Explain things the way you'd explain them to a friend, not the way a consultant writes a report.

Current month: ${currentMonth}
(Consider Philippine seasonal patterns if relevant — e.g. back-to-school demand around June, holiday shopping peak around October-December, lean months typically January-February. ${
      locationLabel
        ? `This shop is specifically in ${locationLabel}, Philippines. Size every suggestion realistically to a shop of this scale in ${locationLabel} — don't assume Metro Manila or big-city-level foot traffic, ad budgets, or customer surges unless that's genuinely realistic for this area.`
        : `This shop's exact city isn't set yet, so assume a small local Philippine town rather than a big city, and keep suggestions realistic for that scale.`
    })

Time range being analyzed: ${rangeLabel}

Day-by-day / period-by-period breakdown (spot patterns like a specific weekday or date that's consistently weak or strong):
${JSON.stringify(periodSeries)}

Performance vs previous equivalent period:
${JSON.stringify(comparison)}

Top-selling items this period:
${JSON.stringify(topSellingItems)}

Items with stock but NO sales this period (slow-moving / stagnant stock):
${JSON.stringify(slowMovingItems)}

Items running low on stock:
${JSON.stringify(lowStockItems)}

Revenue by category this period:
${JSON.stringify(categoryBreakdown)}

Items with a LOW profit margin (name + current margin %) — may need a price adjustment:
${JSON.stringify(marginAnalysis)}

Repair ticket activity this period (this shop also does device repairs, not just retail):
${JSON.stringify(repairMetrics)}

Recurring repair issues reported by customers more than once (possible signal to stock specific parts):
${JSON.stringify(commonIssues)}

Respond with ONLY this exact JSON shape, no markdown, no extra text:

{
  "summary": "",
  "tasks": [
    { "text": "", "priority": "high" },
    { "text": "", "priority": "medium" }
  ],
  "suggestedGoal": { "label": "", "value": "" }
}

Rules:
- Use SIMPLE, EVERYDAY words only. Avoid business jargon like "visibility," "implement," "capture data," "leverage," "optimize," "trending," "strategy," "engagement." Say things plainly instead — e.g. "post on Facebook" instead of "increase visibility," "write it down" instead of "capture data." If a shop owner with no business background wouldn't instantly understand a word, don't use it.
- "summary": ONE short, plain sentence saying whether the shop did better or worse this period, in numbers, weighing both retail sales AND repair activity if relevant. Mention the season only if it's genuinely relevant. No fluff, no jargon.
- "tasks": Give AT MOST 5 tasks total, and ONLY the highest-impact ones. Draw from ALL the data provided — stock issues, pricing/margin issues, recurring repair patterns, weekday/date patterns, and seasonal timing are all fair game, not just sales totals. Under 15 words each, plain language, something the owner can literally just go do. Reference actual item names, device names, issues, or numbers. Assign "priority": "high" for urgent/time-sensitive items, "medium" for important but not urgent. Skip "low" priority items entirely. Never give vague advice. If there's truly only 1-2 high-value issues, give just those instead of padding to 5.
- "suggestedGoal": A realistic, slightly challenging revenue or profit target for next month based on the current trend and season, sized to what a small local shop could actually reach — not a generic big-growth number. "label" should be short like "Sales Target Next Month". "value" should be a peso amount like "₱145,000".
- Keep everything short and simple enough that someone with zero business background can read it in 10 seconds and immediately understand what to do.`;


    const response = await fetchGeminiWithRetry(geminiUrl(apiKey), {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json({ error: "UBA analysis failed" }, { status: 502 });
    }

    const data = await response.json();

    // Gemini 3.x models may attach thinking/reasoning parts with no "text" field —
    // filter and join only the parts that actually contain text.
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const rawText = parts
      .filter((p: any) => typeof p.text === "string")
      .map((p: any) => p.text)
      .join("");

    if (!rawText) {
      console.error("Unexpected Gemini response shape:", JSON.stringify(data));
      return NextResponse.json({ error: "No insight generated" }, { status: 502 });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("Couldn't parse AI JSON:", rawText);
      return NextResponse.json({ error: "Couldn't read UBA's answer" }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("analyze-business error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}