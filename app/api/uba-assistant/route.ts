import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../lib/firebaseAdmin";
import { hasFeatureAccess, AI_LOCKED_MESSAGE } from "../../lib/subscription";
import { requireSession } from "../../lib/apiAuth";
import { checkAndIncrementUsageServer } from "../../lib/usageLimitsAdmin";
import { usageLimitMessage } from "../../lib/usageLimits";
import { geminiUrl, fetchGeminiWithRetry } from "../../lib/geminiFetch";

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
    const auth = await requireSession(req);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.session;

    const { message, history, businessContext } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "That message isn't valid. Please type a message." },
        { status: 400 }
      );
    }

    // --- 0. Server-side plan/subscription check (never trust the client for
    // this) — still needs a Pro/Business plan, and not expired/deactivated.
    let tenant: any = null;
    try {
      const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
      tenant = tenantSnap.exists ? tenantSnap.data() : null;
      if (!hasFeatureAccess(tenant, "aiFeatures")) {
        return NextResponse.json({ error: AI_LOCKED_MESSAGE }, { status: 403 });
      }
    } catch (accessErr) {
      console.error("uba-assistant access check failed:", accessErr);
      return NextResponse.json(
        { error: "Couldn't check your access right now. Please try again shortly." },
        { status: 500 }
      );
    }

    const usage = await checkAndIncrementUsageServer(tenantId, "chatCount", tenant);
    if (!usage.allowed) {
      return NextResponse.json({ error: usageLimitMessage("chatCount", usage.limit) }, { status: 403 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Something's wrong on our end. Please contact support." },
        { status: 500 }
      );
    }

    // --- 1. Cache Check ---
    const cacheKey = `${tenantId}:${message.trim().toLowerCase()}`;
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
    const response = await fetchGeminiWithRetry(geminiUrl(apiKey), requestBody);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);

      if (response.status === 429) {
        return NextResponse.json(
          { 
            error: "The UBA Assistant is very busy right now. Please try again in a few moments."
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { 
          error: "Couldn't handle your request right now. Please try again shortly."
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
        { error: "The assistant couldn't come up with an answer. Please try asking in a different way." },
        { status: 502 }
      );
    }

    // Save sa Cache
    responseCache.set(cacheKey, { reply: replyText, timestamp: Date.now() });

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    console.error("uba-assistant error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}