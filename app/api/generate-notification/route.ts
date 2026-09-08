import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { customerName, deviceInfo, totalCost, businessName } = await req.json();

    if (!customerName || !deviceInfo) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const prompt = `Write a short, friendly SMS/text message in Taglish (mix of Tagalog and English, casual but polite) from a repair shop to a customer, letting them know their device is ready for pickup.

Details:
- Customer name: ${customerName}
- Device: ${deviceInfo}
- Total amount due: ₱${Number(totalCost).toLocaleString()}
- Shop name: ${businessName || "the shop"}

Rules:
- Keep it under 3 sentences, SMS-length (this will be sent via text message).
- Mention the customer's name, the device, and the amount due.
- Sound warm and professional, like a small local shop owner — not robotic.
- Do NOT include a greeting like "Dear" or a formal closing/signature.
- Respond with ONLY the message text, nothing else — no quotes, no labels, no markdown.`;

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
      return NextResponse.json({ error: "Couldn't draft a message" }, { status: 502 });
    }

    const data = await response.json();

    // Filter thinking-only parts (no text), keep only actual message text
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const message = parts
      .filter((p: any) => typeof p.text === "string")
      .map((p: any) => p.text)
      .join("")
      .trim();

    if (!message) {
      console.error("Unexpected Gemini response shape:", JSON.stringify(data));
      return NextResponse.json({ error: "No message generated" }, { status: 502 });
    }

    return NextResponse.json({ message });
  } catch (err) {
    console.error("generate-notification error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}