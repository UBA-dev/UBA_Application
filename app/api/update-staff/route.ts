import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/app/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await getAuth().verifyIdToken(idToken);

    if ((decoded as any).isStaff) {
      return NextResponse.json({ error: "Only the business owner can edit staff." }, { status: 403 });
    }

    const { staffId, name, username, role, newPin } = await req.json();

    if (!staffId || !name?.trim() || !username?.trim() || !role) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!["secretary", "cashier"].includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const staffRef = adminDb.collection("tenants").doc(decoded.uid).collection("staff").doc(staffId);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    // Only check for username conflicts against OTHER staff docs, not this one
    const existing = await adminDb
      .collection("tenants")
      .doc(decoded.uid)
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
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("update-staff error:", err);
    return NextResponse.json({ error: "Something went wrong updating this staff account." }, { status: 500 });
  }
}