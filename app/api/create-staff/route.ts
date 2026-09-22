import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/app/lib/firebaseAdmin";
import { requireOwnerSession } from "@/app/lib/apiAuth";
import { getPlanLimits, staffCapMessage } from "@/app/lib/subscription";
import { PLANS } from "@/app/lib/plans";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOwnerSession(req);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.session;

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ error: "Business account not found." }, { status: 404 });
    }
    const tenant = tenantSnap.data();

    const { name, username, pin, role } = await req.json();

    if (!name?.trim() || !username?.trim() || !pin || !role) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!["secretary", "cashier"].includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4-6 digits." }, { status: 400 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const staffRef = adminDb.collection("tenants").doc(tenantId).collection("staff");
    const existing = await staffRef.where("username", "==", normalizedUsername).get();
    if (!existing.empty) {
      return NextResponse.json({ error: "That username is already taken in your shop." }, { status: 409 });
    }

    // Enforce the plan's staff limit. Deactivated staff don't count, so
    // replacing someone who left doesn't permanently eat into the cap.
    const limits = getPlanLimits(tenant);
    const allStaffSnap = await staffRef.get();
    const activeStaffCount = allStaffSnap.docs.filter((d) => d.data().active !== false).length;
    if (activeStaffCount >= limits.staffCap) {
      const planName = PLANS[limits.key as keyof typeof PLANS]?.name || (limits.key === "trial" ? "trial" : "Free");
      return NextResponse.json(
        { error: staffCapMessage(limits.staffCap, planName) },
        { status: 403 }
      );
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const newStaffDoc = await staffRef.add({
      name: name.trim(),
      username: normalizedUsername,
      pinHash,
      role,
      active: true,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ id: newStaffDoc.id });
  } catch (err: any) {
    console.error("create-staff error:", err);
    return NextResponse.json({ error: "Something went wrong creating this staff account." }, { status: 500 });
  }
}