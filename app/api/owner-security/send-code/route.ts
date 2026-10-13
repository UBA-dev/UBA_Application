import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "../../../lib/apiAuth";
import { adminDb } from "../../../lib/firebaseAdmin";
import { sendEmail } from "../../../lib/mailer";
import {
  CODE_TTL_MS,
  OWNER_SECURITY,
  RESEND_AFTER_MS,
  cleanDeviceLabel,
  codeEmail,
  hashDeviceId,
  isValidDeviceId,
  loadOwnerSecurity,
  maskEmail,
  newCode,
  sendLimit,
  type PendingCode,
} from "../../../lib/ownerSecurity";

// Emails a 6-digit code to the Owner's verified email address.
export async function POST(req: NextRequest) {
  const auth = await requireOwnerSession(req, { allowInactiveOwner: true });
  if (!auth.ok) return auth.response;
  const { uid, authTime, email } = auth.session;
  if (!email) {
    return NextResponse.json({ error: "This account has no email address. Contact UBA support." }, { status: 400 });
  }

  const { deviceId, deviceLabel } = await req.json().catch(() => ({}));
  if (!isValidDeviceId(deviceId)) {
    return NextResponse.json({ error: "This browser couldn't be identified. Refresh and try again." }, { status: 400 });
  }

  const { session, security } = await loadOwnerSecurity(uid);
  if (session?.activeAuthTime === authTime) return NextResponse.json({ state: "active" });

  const now = Date.now();
  const limit = sendLimit(security?.sendLog, now);
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.message, retryInSeconds: limit.retryInSeconds }, { status: 429 });
  }

  const label = cleanDeviceLabel(deviceLabel);
  const { code, codeHash } = newCode(uid);
  const pending: PendingCode = {
    codeHash,
    deviceHash: hashDeviceId(deviceId),
    deviceLabel: label,
    authTime,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
  };
  const recentSends = (security?.sendLog || []).filter((t) => now - t < 24 * 60 * 60 * 1000);
  await adminDb.collection(OWNER_SECURITY).doc(uid).set({ pending, sendLog: [...recentSends, now] }, { merge: true });

  const sent = await sendEmail({ to: email, ...codeEmail(code, label) });
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    maskedEmail: maskEmail(email),
    resendInSeconds: Math.round(RESEND_AFTER_MS / 1000),
  });
}
