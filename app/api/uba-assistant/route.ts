import { NextRequest, NextResponse } from "next/server";

// In-memory cache para sa identical prompt queries
const responseCache = new Map<string, { reply: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
    const { userId, message, history, businessContext } = await req.json();

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

    // --- 1. Cache Check ---
    const cacheKey = `${userId}:${message.trim().toLowerCase()}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ reply: cached.reply, cached: true });
    }

    // --- 2. Context Trimming ---
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
- Sourcing/suppliers — e.g. "where can I buy a cheap motherboard" (use web search for this)
- General small-business advice relevant to a computer/electronics repair-retail shop

STYLE:
- Respond fluently in the language used by the user (English, Tagalog, or Taglish).
- Be concise, direct, and specific.

THIS SHOP'S CURRENT DATA SUMMARY:
${JSON.stringify(trimmedContext)}`;

    // --- 3. Trimmed History ---
    const MAX_HISTORY_MESSAGES = 6;
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

    const useSearch = needsWebSearch(message);

    const requestBody: any = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        maxOutputTokens: 1024,
      },
    };

    if (useSearch) {
      requestBody.tools = [{ google_search: {} }];
    }

    // --- 4. Gemini API Call ---
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);

      if (response.status === 429) {
        return NextResponse.json(
          { 
            error: "The AI assistant is currently experiencing high request volume or usage limits. Please try again in a few moments." 
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { 
          error: "Unable to process your request at this time. Please try again shortly." 
        },
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
      console.error("Unexpected Gemini response shape:", JSON.stringify(data));
      return NextResponse.json(
        { error: "The assistant was unable to generate a response. Please rephrase your query." },
        { status: 502 }
      );
    }

    // Save sa Cache
    responseCache.set(cacheKey, { reply: replyText, timestamp: Date.now() });

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    console.error("uba-assistant error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while processing your request. Please try again later." },
      { status: 500 }
    );
  }
}