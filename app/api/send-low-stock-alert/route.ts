import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
    const { ownerEmail, businessName, items } = await req.json();

    if (!ownerEmail || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const resend = new Resend(apiKey);

    const itemRows = items
      .map(
        (i: any) =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${i.name}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.stock}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.threshold}</td></tr>`
      )
      .join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color:#1e293b;">⚠️ Low Stock Alert — ${businessName || "Your Shop"}</h2>
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