import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/app/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { shopCode, username, pin } = await req.json();

    if (!shopCode?.trim() || !username?.trim() || !pin) {
      return NextResponse.json({ error: "Please fill in all fields." }, { status: 400 });
    }

    const normalizedShopCode = shopCode.trim().toUpperCase();
    const normalizedUsername = username.trim().toLowerCase();

    const tenantQuery = await adminDb
      .collection("tenants")
      .where("shopCode", "==", normalizedShopCode)
      .limit(1)
      .get();

    if (tenantQuery.empty) {
      return NextResponse.json({ error: "Shop code not found. Please check with your owner." }, { status: 404 });
    }

    const tenantDoc = tenantQuery.docs[0];
    const tenantId = tenantDoc.id;
    const businessName = tenantDoc.data().businessName || "";

    const staffQuery = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("staff")
      .where("username", "==", normalizedUsername)
      .limit(1)
      .get();

    if (staffQuery.empty) {
      return NextResponse.json({ error: "Invalid username or PIN." }, { status: 401 });
    }

    const staffDoc = staffQuery.docs[0];
    const staffData = staffDoc.data();

    if (staffData.active === false) {
      return NextResponse.json({ error: "This staff account has been deactivated." }, { status: 403 });
    }

    const pinMatches = await bcrypt.compare(pin, staffData.pinHash);
    if (!pinMatches) {
      return NextResponse.json({ error: "Invalid username or PIN." }, { status: 401 });
    }

    const staffUid = `staff_${staffDoc.id}`;
    const customToken = await getAuth().createCustomToken(staffUid, {
      isStaff: true,
      tenantId,
      role: staffData.role,
      staffId: staffDoc.id,
      staffName: staffData.name,
    });

    return NextResponse.json({ token: customToken, businessName, staffName: staffData.name, role: staffData.role });
  } catch (err: any) {
    console.error("staff-login error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}