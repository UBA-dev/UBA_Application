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

    // Only real Owner accounts (never staff, even if their token somehow
    // reached this route) may create new staff.
    if ((decoded as any).isStaff) {
      return NextResponse.json({ error: "Only the business owner can add staff." }, { status: 403 });
    }

    const tenantSnap = await adminDb.collection("tenants").doc(decoded.uid).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ error: "Business account not found." }, { status: 404 });
    }

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

    const staffRef = adminDb.collection("tenants").doc(decoded.uid).collection("staff");
    const existing = await staffRef.where("username", "==", normalizedUsername).get();
    if (!existing.empty) {
      return NextResponse.json({ error: "That username is already taken in your shop." }, { status: 409 });
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