import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/app/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const decoded = await getAuth().verifyIdToken(authHeader.split("Bearer ")[1]);

    // Owner lang ang pwedeng magbawi ng session ng staff
    if ((decoded as any).isStaff) {
      return NextResponse.json({ error: "Only the business owner can do this." }, { status: 403 });
    }

    const { staffId } = await req.json();
    if (!staffId) {
      return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
    }

    // Siguraduhing ang staff na ito ay sa business ng Owner na ito
    const staffSnap = await adminDb
      .collection("tenants")
      .doc(decoded.uid)
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