import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/app/lib/firebaseAdmin";
import { requireOwnerSession } from "@/app/lib/apiAuth";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOwnerSession(req);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.session;

    const { staffId, name, username, role, newPin } = await req.json();

    if (!staffId || !name?.trim() || !username?.trim() || !role) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!["secretary", "cashier"].includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const staffRef = adminDb.collection("tenants").doc(tenantId).collection("staff").doc(staffId);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    // Only check for username conflicts against OTHER staff docs, not this one
    const existing = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("staff")
      .where("username", "==", normalizedUsername)
      .get();
    const conflict = existing.docs.find((d) => d.id !== staffId);
    if (conflict) {
      return NextResponse.json({ error: "That username is already taken by another staff member." }, { status: 409 });
    }

    const updateData: any = {
      name: name.trim(),
      username: normalizedUsername,
      role,
    };

    if (newPin) {
      if (!/^\d{4,6}$/.test(newPin)) {
        return NextResponse.json({ error: "PIN must be 4-6 digits." }, { status: 400 });
      }
      updateData.pinHash = await bcrypt.hash(newPin, 10);
    }

    await staffRef.update(updateData);
    
    // I-update ang claims (role at pangalan) at bawiin ang session, para
    // tumalab ang bagong role pagka-login ulit ng staff
    const staffUid = `staff_${staffId}`;
    try {
      await getAuth().setCustomUserClaims(staffUid, {
        isStaff: true,
        tenantId,
        role,
        staffId,
        staffName: name.trim(),
      });
      await getAuth().revokeRefreshTokens(staffUid);
    } catch (err: any) {
      // Kung hindi pa nakaka-login kailanman ang staff, wala pang Auth account. Ok lang.
      if (err.code !== "auth/user-not-found") throw err;
    }

    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("update-staff error:", err);
    return NextResponse.json({ error: "Something went wrong updating this staff account." }, { status: 500 });
  }
}