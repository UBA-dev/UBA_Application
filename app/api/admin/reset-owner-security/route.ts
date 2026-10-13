import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "../../../lib/apiAuth";
import { adminDb } from "../../../lib/firebaseAdmin";
import { OWNER_SECURITY, OWNER_SESSIONS } from "../../../lib/ownerSecurity";

// Same admin account as /api/check-admin.
const ADMIN_UID = "hQYa5p6kpnfHj8oFneud3eLxYPx2";

// Support recovery for an Owner stuck on the device check: clears their
// active-device record and any pending code. Their next sign-in still needs a
// code emailed to their account email (unless the account is under a day old).
export async function POST(req: NextRequest) {
  const auth = await requireOwnerSession(req);
  if (!auth.ok) return auth.response;
  if (auth.session.uid !== ADMIN_UID) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { tenantId } = await req.json().catch(() => ({}));
  if (typeof tenantId !== "string" || !tenantId) {
    return NextResponse.json({ error: "Missing shop." }, { status: 400 });
  }

  await Promise.all([
    adminDb.collection(OWNER_SECURITY).doc(tenantId).delete(),
    adminDb.collection(OWNER_SESSIONS).doc(tenantId).delete(),
  ]);
  return NextResponse.json({ ok: true });
}
