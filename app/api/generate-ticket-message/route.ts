import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../lib/firebaseAdmin";
import { hasFeatureAccess, AI_LOCKED_MESSAGE } from "../../lib/subscription";
import { requireSession } from "../../lib/apiAuth";
import { checkAndIncrementUsageServer } from "../../lib/usageLimitsAdmin";
import { usageLimitMessage } from "../../lib/usageLimits";
import { geminiUrl, fetchGeminiWithRetry } from "../../lib/geminiFetch";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.session;

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenant = tenantSnap.exists ? tenantSnap.data() : null;
    if (!hasFeatureAccess(tenant, "aiFeatures")) {
      return NextResponse.json({ error: AI_LOCKED_MESSAGE }, { status: 403 });
    }

    const usage = await checkAndIncrementUsageServer(tenantId, "notificationCount", tenant);
    if (!usage.allowed) {
      return NextResponse.json({ error: usageLimitMessage("notificationCount", usage.limit) }, { status: 403 });
    }

    const { ticketType, customerName, statusLabel, details, totalAmount } = await req.json();

    if (!customerName || !statusLabel) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not set up" }, { status: 500 });
    }

    const prompt = `You are writing a short, friendly customer notification message in Taglish (mix of Tagalog and English) for a small shop's ${ticketType} update.

Customer name: ${customerName}
Update: ${statusLabel}
Details: ${details || "N/A"}
${totalAmount != null ? `Amount: ₱${totalAmount}` : ""}

Write ONE short message (2-4 sentences) suitable for SMS or Messenger. Be warm and professional, not robotic. Include the amount if provided. Do not include a greeting like "Dear" — start naturally like a real text message would.

Respond with ONLY the message text. No quotes, no markdown, no extra commentary.`;

    const response = await fetchGeminiWithRetry(geminiUrl(apiKey), {
      contents: [{ parts: [{ text: prompt }] }],
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json({ error: "UBA message generation failed" }, { status: 502 });
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