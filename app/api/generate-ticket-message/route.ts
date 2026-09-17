import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { ticketType, customerName, statusLabel, details, totalAmount } = await req.json();

    if (!customerName || !statusLabel) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const prompt = `You are writing a short, friendly customer notification message in Taglish (mix of Tagalog and English) for a small shop's ${ticketType} update.

Customer name: ${customerName}
Update: ${statusLabel}
Details: ${details || "N/A"}
${totalAmount != null ? `Amount: ₱${totalAmount}` : ""}

Write ONE short message (2-4 sentences) suitable for SMS or Messenger. Be warm and professional, not robotic. Include the amount if provided. Do not include a greeting like "Dear" — start naturally like a real text message would.

Respond with ONLY the message text. No quotes, no markdown, no extra commentary.`;

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
      return NextResponse.json({ error: "AI message generation failed" }, { status: 502 });
    }

    const data = await response.json();
    const message = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!message) {
      return NextResponse.json({ error: "No message generated" }, { status: 502 });
    }

    return NextResponse.json({ message });
  } catch (err) {
    console.error("generate-ticket-message error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}