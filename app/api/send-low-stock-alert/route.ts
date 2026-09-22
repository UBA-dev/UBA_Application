import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "../../lib/firebaseAdmin";
import { hasFeatureAccess } from "../../lib/subscription";
import { requireSession } from "../../lib/apiAuth";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.session;

    const { items } = await req.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // Owner email, business name, and plan all come from Firestore, never
    // from the request body — otherwise anyone could make this endpoint
    // email any address, on the Owner's Resend account, regardless of plan.
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenant = tenantSnap.exists ? tenantSnap.data() : null;

    if (!hasFeatureAccess(tenant, "lowStockEmail")) {
      return NextResponse.json(
        { error: "This feature is for the Pro/Business plan." },
        { status: 403 }
      );
    }

    const ownerEmail = tenant?.ownerEmail;
    if (!ownerEmail) {
      return NextResponse.json({ error: "No email on file for this account." }, { status: 400 });
    }
    const businessName = tenant?.businessName;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not set up" }, { status: 500 });
    }

    const resend = new Resend(apiKey);

    const itemRows = items
      .map(
        (i: any) =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(i.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${Number(i.stock) || 0}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${Number(i.threshold) || 0}</td></tr>`
      )
      .join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color:#1e293b;">⚠️ Low Stock Alert — ${escapeHtml(businessName || "Your Shop")}</h2>
        <p style="color:#475569;">These items are at or below their low-stock threshold:</p>
        <table style="width:100%; border-collapse:collapse; margin-top:12px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px 12px; text-align:left;">Item</th>
              <th style="padding:8px 12px;">Stock</th>
              <th style="padding:8px 12px;">Threshold</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p style="color:#94a3b8; font-size:12px; margin-top:20px;">Sent automatically by UBA — your business assistant.</p>
      </div>
    `;

    await resend.emails.send({
      from: "UBA Alerts <onboarding@resend.dev>",
      to: ownerEmail,
      subject: `⚠️ ${items.length} item(s) low on stock — ${businessName || "Your Shop"}`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-low-stock-alert error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
