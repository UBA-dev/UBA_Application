import { NextResponse } from "next/server";
import Xendit from "xendit-node";

// Initialize Xendit Client using the Secret Key from .env.local
const xenditClient = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY || "",
});

export async function POST(request: Request) {
  try {
    const { tenantId, email, planId, planName, amount } = await request.json();

    if (!tenantId || !planId || !amount) {
      return NextResponse.json(
        { error: "Missing some required information. Please try again." },
        { status: 400 }
      );
    }

    // Embed both tenantId and planId in externalId so the webhook can
    // identify exactly which plan was purchased once payment is confirmed.
    const externalId = `sub_${tenantId}_${planId}_${Date.now()}`;

    const response = await xenditClient.Invoice.createInvoice({
      data: {
        externalId,
        amount: amount,
        payerEmail: email,
        description: `UBA Subscription - ${planName} Plan`,
        currency: "PHP",
        successRedirectUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/dashboard?payment=success`,
        failureRedirectUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/pricing?payment=failed`,
      },
    });

    return NextResponse.json({ invoiceUrl: response.invoiceUrl });
  } catch (error: any) {
    console.error("Xendit Checkout Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create payment link" },
      { status: 500 }
    );
  }
}