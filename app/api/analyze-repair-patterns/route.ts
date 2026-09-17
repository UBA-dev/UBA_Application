import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { tickets } = await req.json();

    if (!Array.isArray(tickets) || tickets.length === 0) {
      return NextResponse.json({ error: "No tickets provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const ticketList = tickets
      .map((t: any, i: number) => `${i + 1}. Device: ${t.deviceInfo} | Issue: ${t.issueDescription}`)
      .join("\n");

    const prompt = `You are analyzing repair shop history to find recurring issue patterns.

Here are past repair tickets:
${ticketList}

Group these into common issue patterns — even if worded differently, cluster tickets describing the SAME underlying problem (e.g. "won't turn on" and "hindi nagbubukas" are the same cluster).

Respond with ONLY this exact JSON shape:

{
  "commonIssues": [
    {
      "issue": "short description of the clustered issue",
      "count": <number of tickets matching this cluster>,
      "affectedDevices": ["device type 1", "device type 2"],
      "suggestedPartsToStock": ["part name if a physical part is clearly relevant, else empty array"]
    }
  ]
}

Rules:
- Only include clusters with count >= 2 — a single occurrence isn't a "pattern."
- Sort by count, descending (most frequent first).
- Keep "issue" under 10 words.
- If no genuine patterns exist (all issues are unique), return an empty array.

Respond ONLY with valid JSON. No markdown, no extra text.`;

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
      return NextResponse.json({ error: "Pattern analysis failed" }, { status: 502 });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json({ error: "No result from AI" }, { status: 502 });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Couldn't parse AI response" }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("analyze-repair-patterns error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}