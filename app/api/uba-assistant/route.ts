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
        const inventory = businessContext?.inventory || [];
    const recentSales = businessContext?.recentSales || [];
    const recentRepairTickets = businessContext?.recentRepairTickets || [];

    const lowStockItems = inventory
      .filter((i: any) => i.stock <= (i.threshold ?? 0))
      .map((i: any) => ({ name: i.name, stock: i.stock }));

    const recentSalesRevenue = recentSales.reduce((sum: number, s: any) => sum + (s.total || 0), 0);

    const repairStatusCounts = recentRepairTickets.reduce((acc: Record<string, number>, t: any) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});

    const trimmedContext = {
      businessName: businessContext?.businessName || "",
      totalInventoryItems: inventory.length,
      lowStockItems,
      // Compact sample of the inventory — enough for the assistant to answer
      // "how much is X" or "what's my stock of Y" without sending everything raw
      inventorySample: inventory.slice(0, 40).map((i: any) => ({
        name: i.name,
        category: i.category,
        stock: i.stock,
        price: i.sellingPrice,
      })),
      recentSalesCount: recentSales.length,
      recentSalesRevenue,
      recentRepairTicketStatusCounts: repairStatusCounts,
    };

    const systemInstruction = `You are "UBA Assistant" — a personal business assistant built into UBA (a shop management app), speaking directly to the shop owner.

SCOPE — you may ONLY help with things related to running THIS owner's business:
- Their inventory, stock levels, pricing, categories
- Their sales, expenses, profit, trends
- Their repair tickets and customers
- Sourcing/suppliers — e.g. "where can I buy a cheap motherboard" (use web search for this — search broadly, including outside the Philippines if relevant, and recommend real, current options)
- General small-business advice relevant to a computer/electronics repair-retail shop (pricing strategy, upselling, inventory management, customer retention, etc.)

If the owner asks something with NO connection to running their business (trivia, history, celebrities, unrelated general knowledge, etc.), politely decline in ONE short sentence and redirect back to how you can help with their shop. Do not answer the off-topic question even partially.

IMPORTANT — search tool usage: Even when the Google Search tool is available to you, ONLY use it to look up things directly relevant to THIS shop's business — computer/electronics parts, accessories, repair tools, or supplies they might stock or need for repairs. If a message mentions buying/pricing something with NO connection to a computer/electronics repair-retail shop (e.g. pet food, groceries, clothing, unrelated services), do NOT search — immediately apply the off-topic decline rule above instead.

STYLE — this is critical:
- Write in professional, natural English by default. If the owner writes to you in another language (Tagalog, Taglish, or anything else), respond fluently in that same language instead — you understand and can respond in any language the owner uses, mirroring them naturally.
- Be concise but complete: a few clear sentences or a short list is usually right. Don't pad with filler ("I hope this helps," "Great question!") — but don't over-compress either. If a question genuinely needs a bit more detail to be useful (e.g. a specific number, a short explanation, or a few options), include it. The goal is a reply a busy owner can read in a few seconds AND actually act on, not the shortest possible reply.
- Be direct and specific. No vague generalities.
- When recommending suppliers/shops/prices from search, name specific real options with rough prices if found.

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
        // Newer Gemini models spend part of this budget on internal "thinking"
        // before writing the visible reply, so this needs real headroom —
        // a low number here was cutting off the actual answer.
        maxOutputTokens: 1024,
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