import { NextRequest, NextResponse } from "next/server";

// In-memory cache para sa identical prompt queries (same pattern as uba-assistant)
const responseCache = new Map<string, { reply: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Ito ang "knowledge base" ng Support Assistant — mga alam nitong FAQ tungkol
// sa PAGGAMIT ng UBA app mismo (hindi business data ng tenant). I-update mo
// ito habang lumalaki ang app o may bagong feature.
const SUPPORT_KNOWLEDGE = `
- UBA ay isang shop management app: Inventory, Repair Tickets, Delivery Tickets,
  P.O./Purchase Orders, Sales & Expenses, at POS/Checkout.
- Settings > Modules: pwedeng i-on/off ang Repair Tickets, Delivery Tickets,
  at P.O. Tickets kung hindi ginagamit, para simplified ang navigation.
- Low Stock Alerts: awtomatikong lumalabas sa Sidebar/top bar kapag may item
  na stock ≤ threshold na naka-set sa Inventory.
- Themes: pwedeng palitan sa Settings > Choose Your Theme, instant apply.
- May offline support ang app (cached data) kapag nawalan ng internet, pero
  kailangan ng koneksyon para sa unang pag-load at pag-sync.
- Subscription plans: Basic, Pro, Business — makikita ang status sa Sidebar
  malapit sa business name.
`;

export async function POST(req: NextRequest) {
  try {
    const { userId, message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Invalid input. Please provide a valid message." },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Please log in to continue." },
        { status: 401 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "System configuration error. Please contact the administrator." },
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { maxOutputTokens: 512 },
        }),
      }
    );

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
        { error: "Unable to process your request at this time. Please try again shortly." },
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
        { error: "The assistant was unable to generate a response. Please rephrase your question." },
        { status: 502 }
      );
    }

    responseCache.set(cacheKey, { reply: replyText, timestamp: Date.now() });

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    console.error("support-assistant error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while processing your request. Please try again later." },
      { status: 500 }
    );
  }
}