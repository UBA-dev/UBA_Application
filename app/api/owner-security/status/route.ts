import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { requireOwnerSession } from "../../../lib/apiAuth";
import {
  NEW_ACCOUNT_GRACE_MS,
  activateOwnerSession,
  cleanDeviceLabel,
  hashDeviceId,
  isValidDeviceId,
  loadOwnerSecurity,
  maskEmail,
} from "../../../lib/ownerSecurity";

// What this Owner sign-in needs before it can use UBA:
//   active — it's the active device, the same device signing in again, or a
//            brand-new account's first device
//   verify — confirm with a code emailed to the Owner
export async function POST(req: NextRequest) {
  const auth = await requireOwnerSession(req, { allowInactiveOwner: true });
  if (!auth.ok) return auth.response;
  const { uid, authTime, email } = auth.session;

  const { deviceId, deviceLabel } = await req.json().catch(() => ({}));
  if (!isValidDeviceId(deviceId)) {
    return NextResponse.json({ error: "This browser couldn't be identified. Refresh and try again." }, { status: 400 });
  }
  const deviceHash = hashDeviceId(deviceId);
  const label = cleanDeviceLabel(deviceLabel);
  const { session } = await loadOwnerSecurity(uid);

  if (session?.activeAuthTime === authTime) return NextResponse.json({ state: "active" });

  // The active device signed in again (new sign-in, same browser): no code.
  if (session && session.activeDeviceHash === deviceHash) {
    await activateOwnerSession(uid, authTime, deviceHash, label);
    return NextResponse.json({ state: "active" });
  }

  // A brand-new account's first device: its email was just verified at sign-up.
  if (!session) {
    const user = await getAuth().getUser(uid);
    if (Date.now() - Date.parse(user.metadata.creationTime) < NEW_ACCOUNT_GRACE_MS) {
      await activateOwnerSession(uid, authTime, deviceHash, label);
      return NextResponse.json({ state: "active" });
    }
  }

  return NextResponse.json({
    state: "verify",
    maskedEmail: email ? maskEmail(email) : "your email",
    activeDeviceLabel: session?.activeDeviceLabel ?? null,
    // No device has been verified yet, so nothing is protected to lose.
    firstTime: !session,
  });
}
