import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache para sa paulit-ulit na EXACT same question
// Note: nare-reset ito kapag nag-restart ang server, pero libre at agad tumutulong
const responseCache = new Map<string, { reply: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Mga keywords na nagpapahiwatig kailangan ng web search (supplier/pricing questions)
const SEARCH_KEYWORDS = [
  "buy", "bili", "supplier", "presyo", "price", "saan", "where",
  "mura", "cheap", "shop", "store", "magkano",
];

function needsWebSearch(message: string): boolean {
  const lower = message.toLowerCase();
  return SEARCH_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function POST(req: NextRequest) {
  try {
    const { message, history, businessContext } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    // --- OPTIMIZATION 1: Cache check para sa exact duplicate questions ---
    const cacheKey = message.trim().toLowerCase();
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ reply: cached.reply, cached: true });
    }

    // --- OPTIMIZATION 2: I-trim ang businessContext, huwag ipadala nang buo ---
    // Sample lang - i-adjust base sa actual shape ng businessContext mo.
    // Layunin: kunin lang yung summary/relevant fields, hindi buong raw arrays.
    const trimmedContext = businessContext
      ? {
          totalItems: businessContext.inventory?.length ?? 0,
          lowStockItems: businessContext.inventory
            ?.filter((i: any) => i.stock <= (i.threshold ?? 0))
            ?.map((i: any) => ({ name: i.name, stock: i.stock })) ?? [],
          recentSalesSummary: businessContext.salesSummary ?? null,
          // idagdag lang dito ang fields na TALAGANG ginagamit ng assistant sa pagsagot
        }
      : {};

    const systemInstruction = `You are "UBA Assistant" — a personal business assistant built into UBA (a shop management app), speaking directly to the shop owner.

SCOPE — you may ONLY help with things related to running THIS owner's business:
- Their inventory, stock levels, pricing, categories
- Their sales, expenses, profit, trends
- Their repair tickets and customers
- Sourcing/suppliers — e.g. "where can I buy a cheap motherboard" (use web search for this — search broadly, including outside the Philippines if relevant, and recommend real, current options)
- General small-business advice relevant to a computer/electronics repair-retail shop (pricing strategy, upselling, inventory management, customer retention, etc.)

If the owner asks something with NO connection to running their business (trivia, history, celebrities, unrelated general knowledge, etc.), politely decline in ONE short sentence and redirect back to how you can help with their shop. Do not answer the off-topic question even partially.

STYLE — this is critical:
- Business owners are busy and do not want to read a lot. Keep every reply SHORT — a few sentences at most, or a short list if genuinely needed. Never write long paragraphs.
- Be direct and specific. No filler, no "I hope this helps," no over-explaining.
- Match the owner's language/tone (Tagalog, English, or Taglish — mirror however they write to you).
- When recommending suppliers/shops/prices from search, name specific real options with rough prices if found, not vague generalities.

THIS SHOP'S CURRENT DATA SUMMARY (use this to answer questions about their own business — do not invent numbers not present here):
${JSON.stringify(trimmedContext)}`;

    // --- OPTIMIZATION 3: I-limit lang ang history sa huling ilang messages ---
    const MAX_HISTORY_MESSAGES = 6; // huling 6 lang, hindi lahat mula simula
    const trimmedHistory = Array.isArray(history)
      ? history.slice(-MAX_HISTORY_MESSAGES)
      : [];

    const contents = [
      ...trimmedHistory.map((h: any) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    // --- OPTIMIZATION 4: I-on lang ang google_search kung kailangan talaga ---
    const useSearch = needsWebSearch(message);

    const requestBody: any = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        maxOutputTokens: 300, // takda para hindi sumobra ang sagot
      },
    };

    if (useSearch) {
      requestBody.tools = [{ google_search: {} }];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);

      // Mas maayos na fallback message kapag rate-limited (429)
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Medyo busy ang AI assistant ngayon. Subukan ulit sa loob ng ilang segundo." },
          { status: 429 }
        );
      }

      return NextResponse.json({ error: "AI failed to respond" }, { status: 502 });
    }

    const data = await response.json();

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const replyText = parts
      .filter((p: any) => typeof p.text === "string")
      .map((p: any) => p.text)
      .join("");

    if (!replyText) {
      console.error("Unexpected Gemini response shape:", JSON.stringify(data));
      return NextResponse.json({ error: "No response generated" }, { status: 502 });
    }

    // I-save sa cache para next time na parehong tanong, hindi na tumawag sa Gemini
    responseCache.set(cacheKey, { reply: replyText, timestamp: Date.now() });

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    console.error("uba-assistant error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}