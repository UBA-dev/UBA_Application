import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireOwnerSession } from "../../../lib/apiAuth";
import { adminDb } from "../../../lib/firebaseAdmin";
import {
  MAX_CODE_ATTEMPTS,
  OWNER_SECURITY,
  activateOwnerSession,
  codeMatches,
  hashDeviceId,
  isValidDeviceId,
  loadOwnerSecurity,
} from "../../../lib/ownerSecurity";

// Checks the texted code. On success this device becomes the Owner's only
// active device, and every other device is signed out.
export async function POST(req: NextRequest) {
  const auth = await requireOwnerSession(req, { allowInactiveOwner: true });
  if (!auth.ok) return auth.response;
  const { uid, authTime } = auth.session;

  const { deviceId, code } = await req.json().catch(() => ({}));
  if (!isValidDeviceId(deviceId)) {
    return NextResponse.json({ error: "This browser couldn't be identified. Refresh and try again." }, { status: 400 });
  }

  const { session, security } = await loadOwnerSecurity(uid);
  if (session?.activeAuthTime === authTime) return NextResponse.json({ state: "active" });

  const pending = security?.pending;
  if (!pending) {
    return NextResponse.json({ error: "No code was requested yet. Tap “Email me a code” first." }, { status: 400 });
  }
  if (Date.now() > pending.expiresAt) {
    return NextResponse.json({ error: "That code has expired. Ask for a new one." }, { status: 400 });
  }
  // A code only works for the device and sign-in that asked for it.
  if (pending.deviceHash !== hashDeviceId(deviceId) || pending.authTime !== authTime) {
    return NextResponse.json({ error: "That code was requested on another device. Ask for a new one here." }, { status: 400 });
  }
  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    return NextResponse.json({ error: "Too many wrong tries. Ask for a new code." }, { status: 429 });
  }

  const securityRef = adminDb.collection(OWNER_SECURITY).doc(uid);
  if (!codeMatches(uid, String(code ?? "").trim(), pending.codeHash)) {
    const attempts = pending.attempts + 1;
    await securityRef.update({ "pending.attempts": attempts });
    const left = MAX_CODE_ATTEMPTS - attempts;
    return NextResponse.json(
      { error: left > 0 ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Ask for a new code." },
      { status: 400 }
    );
  }

  await securityRef.update({ pending: FieldValue.delete() });
  await activateOwnerSession(uid, authTime, pending.deviceHash, pending.deviceLabel);
  return NextResponse.json({ state: "active" });
}
