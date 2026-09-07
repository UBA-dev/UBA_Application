import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

        const prompt = `You are a professional but plain-spoken business analyst for a small electronics repair/retail shop owner in the Philippines. The owner is busy and not an accountant — they want direct, specific, short advice, not a long explanation.

Current month: ${currentMonth}
(Consider Philippine seasonal patterns if relevant — e.g. back-to-school demand around June, holiday shopping peak around October-December, lean months typically January-February.)

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
- "summary": ONE short sentence stating whether the business is trending up or down and by roughly how much, weighing both retail sales AND repair activity if relevant. Mention the seasonal context only if it's genuinely relevant to explain the trend. No fluff.
- "tasks": Give AT MOST 5 tasks total, and ONLY the highest-impact ones. Draw from ALL the data provided — stock issues, pricing/margin issues, recurring repair patterns, weekday/date patterns, and seasonal timing are all fair game, not just sales totals. Under 15 words each. Reference actual item names, device names, issues, or numbers. Assign "priority": "high" for urgent/time-sensitive items, "medium" for important but not urgent. Skip "low" priority items entirely. Never give vague advice. If there's truly only 1-2 high-value issues, give just those instead of padding to 5.
- "suggestedGoal": A realistic, slightly challenging revenue or profit target for next month based on the current trend AND seasonal context (retail + repair labor combined). "label" should be short like "Sales Target Next Month". "value" should be a peso amount like "₱145,000".
- Keep everything short. The owner should be able to read this in 10 seconds.`;


    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
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
      return NextResponse.json({ error: "Couldn't parse AI response" }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("analyze-business error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}