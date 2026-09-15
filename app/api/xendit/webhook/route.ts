import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.status === "PAID") {
      const externalId: string = body.external_id; // Format: sub_TENANTID_PLANID_TIMESTAMP
      const parts = externalId.split("_");
      const tenantId = parts[1];
      const planId = parts[2];

      if (tenantId) {
        await adminDb.collection("tenants").doc(tenantId).update({
          subscriptionStatus: "active",
          planId: planId || null,
          updatedAt: new Date().toISOString(),
        });

        console.log(`Successfully activated ${planId} plan for tenant: ${tenantId}`);
      }
    }

    return NextResponse.json({ message: "Webhook processed successfully" }, { status: 200 });
  } catch (error: any) {
    console.error("Xendit Webhook Error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}