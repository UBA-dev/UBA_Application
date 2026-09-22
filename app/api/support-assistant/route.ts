import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../lib/apiAuth";
import { geminiUrl, fetchGeminiWithRetry } from "../../lib/geminiFetch";

// In-memory cache para sa identical prompt queries (same pattern as uba-assistant)
const responseCache = new Map<string, { reply: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Ito ang "knowledge base" ng Support Assistant — mga alam nitong FAQ tungkol
// sa PAGGAMIT ng UBA app mismo (hindi business data ng tenant). I-update mo
// ito habang lumalaki ang app o may bagong feature.
const SUPPORT_KNOWLEDGE = `
- UBA is a shop management app: Inventory, Repair Tickets, Delivery Tickets,
  P.O./Purchase Orders, Sales & Expenses, and POS/Checkout.
- Settings > Modules: you can turn Repair Tickets, Delivery Tickets, and P.O.
  Tickets on/off if you don't use them, to keep the navigation simple.
- Low Stock Alerts: shows up automatically in the Sidebar/top bar when an
  item's stock is at or below the threshold set in Inventory.
- Themes: you can change this in Settings > Choose Your Theme, applies instantly.
- The app has offline support (cached data) when you lose internet, but you
  need a connection for the first load and for syncing.
- Subscription plans: Basic, Pro, Business — you can see your status in the
  Sidebar near the business name.
`;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (!auth.ok) return auth.response;

    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "That message isn't valid. Please type a message." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Something's wrong on our end. Please contact support." },
        { status: 500 }
      );
    }

    // --- Cache Check ---
    const cacheKey = `support:${message.trim().toLowerCase()}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ reply: cached.reply, cached: true });
    }

    const systemInstruction = `You are "UBA Support" — the Help & Support assistant built into UBA,
a shop management app. You ONLY answer questions about HOW TO USE the app itself
(navigation, features, settings, troubleshooting common issues). You do NOT have
access to any shop's inventory, sales, or repair ticket data — never claim to.

WHAT YOU KNOW ABOUT THE APP:
${SUPPORT_KNOWLEDGE}

RULES:
- If the question is about the user's OWN business data (their stock levels, their
  sales numbers, etc.), tell them to use the "UBA Assistant" (the 🤖 chat bubble)
  instead, since that one can see their business data.
- If you don't know the answer, or it sounds like a bug/technical issue, tell the
  user clearly to use the "Send a Suggestion / Report a Problem" form right below
  this chat, or contact the developer directly — do not guess or make up steps.
- Respond fluently in the language the user uses (English, Tagalog, or Taglish).
- Be concise, friendly, and direct.`;

    const MAX_HISTORY_MESSAGES = 6;
    const trimmedHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_MESSAGES) : [];

    const contents = [
      ...trimmedHistory.map((h: any) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const response = await fetchGeminiWithRetry(geminiUrl(apiKey), {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { maxOutputTokens: 512 },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error (support-assistant):", errText);

      if (response.status === 429) {
        return NextResponse.json(
          { error: "The support assistant is currently busy. Please try again in a few moments." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "Couldn't handle your request right now. Please try again shortly." },
        { status: 502 }
      );
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const replyText = parts
      .filter((p: any) => typeof p.text === "string")
      .map((p: any) => p.text)
      .join("");

    if (!replyText) {
      console.error("Unexpected Gemini response shape (support-assistant):", JSON.stringify(data));
      return NextResponse.json(
        { error: "The assistant couldn't come up with an answer. Please try asking in a different way." },
        { status: 502 }
      );
    }

    responseCache.set(cacheKey, { reply: replyText, timestamp: Date.now() });

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    console.error("support-assistant error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}