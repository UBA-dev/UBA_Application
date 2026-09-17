import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { suggestions } = await req.json();

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return NextResponse.json({ error: "No suggestions provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const listText = suggestions
      .map(
        (s: any) =>
          `- ${s.itemName}: ${s.currentStock} ${s.unit} left, selling ~${s.avgDailySales.toFixed(1)}/day, will run out in ~${s.daysRemaining} days. Suggested reorder: ${s.suggestedReorderQty} ${s.unit}.`
      )
      .join("\n");

    const prompt = `You are a business analyst helping a shop owner prioritize restocking.

Here is EXACT, ALREADY-COMPUTED data — do not recalculate or change any numbers, only reference them:
${listText}

Write a short prioritized summary (3-5 sentences, Taglish tone, friendly but direct) telling the owner which items to reorder FIRST and why, based on the days-remaining figures given. Do not invent any numbers not listed above.

Respond with ONLY the summary text. No markdown, no JSON, no extra commentary.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json({ error: "Summary generation failed" }, { status: 502 });
    }

    const data = await response.json();
    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!summary) {
      return NextResponse.json({ error: "No summary generated" }, { status: 502 });
    }

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("generate-reorder-summary error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}