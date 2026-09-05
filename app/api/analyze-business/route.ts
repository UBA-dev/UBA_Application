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
    } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const prompt = `You are a professional but plain-spoken business analyst for a small electronics repair/retail shop owner in the Philippines. The owner is busy and not an accountant — they want direct, specific, short advice, not a long explanation.

Time range: ${rangeLabel}

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

Repair ticket activity this period (this shop also does device repairs, not just retail):
${JSON.stringify(repairMetrics)}

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
- "summary": ONE short sentence stating whether the business is trending up or down and by roughly how much, weighing both retail sales AND repair activity if relevant. No fluff.
- "tasks": Give 2 to 4 SHORT, SPECIFIC, actionable tasks — under 15 words each. Pull from ALL the data given: inventory, sales, AND repair tickets. Reference actual item names, device names, or numbers (e.g. "Restock RAM — only 2 left and selling fast", "3 repair tickets pending over 5 days — follow up with customers", "Bundle SSD-256 — no sales in 30 days"). Assign "priority": "high" for urgent/time-sensitive items (overdue tickets, critical low stock), "medium" for important but not urgent, "low" for nice-to-have. Never give vague advice like "improve marketing" — always tie it to a real item, ticket, or number from the data. If there isn't enough data for 4 tasks, give fewer rather than inventing generic advice.
- "suggestedGoal": A realistic, slightly challenging revenue or profit target for next month based on the current trend (retail + repair labor combined), e.g. current revenue + 10-15% if growing, or a modest recovery target if declining. "label" should be short like "Sales Target Next Month". "value" should be a peso amount like "₱145,000".
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