import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/app/lib/firebaseAdmin";
import { requireOwnerSession } from "@/app/lib/apiAuth";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOwnerSession(req);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.session;

    const { staffId } = await req.json();
    if (!staffId) {
      return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
    }

    // Make sure this staff account belongs to this Owner's business
    const staffSnap = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("staff")
      .doc(staffId)
      .get();
    if (!staffSnap.exists) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    try {
      await getAuth().revokeRefreshTokens(`staff_${staffId}`);
    } catch (err: any) {
      // Kung hindi pa nakaka-login kailanman ang staff, wala pa siyang Auth account. Ok lang.
      if (err.code !== "auth/user-not-found") throw err;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("revoke-staff-session error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}