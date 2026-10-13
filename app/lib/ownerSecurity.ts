// Owner account protection (server side).
//
// Only ONE device may be signed in as the Owner at a time. Each Firebase
// sign-in has its own `auth_time` (fixed for that sign-in, kept across token
// refreshes, unforgeable), so the active sign-in is stored as
// ownerSessions/{uid}.activeAuthTime and everything else is refused — by the
// API (apiAuth.ts) and by the Firestore rules (isOwnerOf), not just the app.
//
// A different device takes over only after a 6-digit code emailed to the
// Owner's verified email address. The same device signing in again needs no
// code, and neither does a brand-new account's first device (its email was
// just verified at sign-up).
//
//   ownerSessions/{uid}  — readable by the Owner: which sign-in is active.
//   ownerSecurity/{uid}  — server only: pending code (hashed), send log.
//
// Device ids are random per browser; only their SHA-256 is stored, so the
// readable session doc never reveals a usable device id.

import { createHash, randomInt, timingSafeEqual } from "crypto";
import { adminDb } from "./firebaseAdmin";

export const OWNER_SESSIONS = "ownerSessions";
export const OWNER_SECURITY = "ownerSecurity";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_AFTER_MS = 60 * 1000;
// A new account's first device is trusted without a code (the email was just
// verified at sign-up).
export const NEW_ACCOUNT_GRACE_MS = 24 * 60 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_SENDS_PER_DAY = 15;

export type OwnerSession = {
  activeAuthTime: number;
  activeDeviceHash: string;
  activeDeviceLabel: string;
  activatedAt: string;
};

export type PendingCode = {
  codeHash: string;
  deviceHash: string;
  deviceLabel: string;
  authTime: number;
  expiresAt: number;
  attempts: number;
};

export type OwnerSecurity = {
  pending?: PendingCode | null;
  sendLog?: number[];
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const hashDeviceId = (deviceId: string) => sha256(`uba-device:${deviceId}`);
const hashCode = (uid: string, code: string) => sha256(`uba-code:${uid}:${code}`);

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{20,64}$/.test(value);
}

export function cleanDeviceLabel(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^\w .()/-]/g, "").slice(0, 40) || "a new device" : "a new device";
}

// juan.delacruz@gmail.com → j••••@gmail.com
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your email";
  return `${local[0]}••••@${domain}`;
}

export async function loadOwnerSecurity(uid: string) {
  const [sessionSnap, securitySnap] = await Promise.all([
    adminDb.collection(OWNER_SESSIONS).doc(uid).get(),
    adminDb.collection(OWNER_SECURITY).doc(uid).get(),
  ]);
  return {
    session: sessionSnap.exists ? (sessionSnap.data() as OwnerSession) : null,
    security: securitySnap.exists ? (securitySnap.data() as OwnerSecurity) : null,
  };
}

// Makes this sign-in the Owner's only active one. Every other device's
// sign-in stops working immediately (rules + API compare activeAuthTime).
export async function activateOwnerSession(uid: string, authTime: number, deviceHash: string, deviceLabel: string) {
  const session: OwnerSession = {
    activeAuthTime: authTime,
    activeDeviceHash: deviceHash,
    activeDeviceLabel: deviceLabel,
    activatedAt: new Date().toISOString(),
  };
  await adminDb.collection(OWNER_SESSIONS).doc(uid).set(session);
}

// Rate limit for emailing codes: one a minute, a few an hour/day.
export function sendLimit(
  sendLog: number[] | undefined,
  now: number
): { allowed: true } | { allowed: false; retryInSeconds: number; message: string } {
  const recent = (sendLog || []).filter((t) => now - t < 24 * 60 * 60 * 1000);
  const last = Math.max(0, ...recent);
  if (now - last < RESEND_AFTER_MS) {
    const retryInSeconds = Math.ceil((RESEND_AFTER_MS - (now - last)) / 1000);
    return { allowed: false, retryInSeconds, message: `Please wait ${retryInSeconds} seconds before asking for another code.` };
  }
  if (recent.filter((t) => now - t < 60 * 60 * 1000).length >= MAX_SENDS_PER_HOUR) {
    return { allowed: false, retryInSeconds: 3600, message: "Too many codes requested. Please try again in an hour." };
  }
  if (recent.length >= MAX_SENDS_PER_DAY) {
    return {
      allowed: false,
      retryInSeconds: 86400,
      message: "Too many codes requested today. Please try again tomorrow or contact UBA support.",
    };
  }
  return { allowed: true };
}

export function newCode(uid: string): { code: string; codeHash: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { code, codeHash: hashCode(uid, code) };
}

export function codeMatches(uid: string, code: string, codeHash: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(hashCode(uid, code), "hex");
  const b = Buffer.from(codeHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The login-code email: the code itself, which device asked, and what to do
// if it wasn't the Owner.
export function codeEmail(code: string, deviceLabel: string) {
  const minutes = Math.round(CODE_TTL_MS / 60000);
  const subject = `${code} is your UBA login code`;
  const text = [
    `Your UBA login code is ${code}`,
    "",
    `Someone is signing in to your UBA Owner account on ${deviceLabel}.`,
    `If this is you, enter the code on that device. It expires in ${minutes} minutes.`,
    "Once it's entered, your other device will be signed out.",
    "",
    "Not you? Don't share this code with anyone, and change your password right away (tap “Forgot password?” on the UBA login page).",
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <p style="font-size:14px;color:#555;margin:0 0 8px">UBA — Universal Business Assistant</p>
  <h2 style="margin:0 0 16px;font-size:20px">Your login code</h2>
  <p style="font-size:34px;font-weight:bold;letter-spacing:8px;margin:0 0 16px;color:#1f3864">${code}</p>
  <p style="font-size:14px;line-height:1.5;margin:0 0 12px">Someone is signing in to your UBA Owner account on <b>${escapeHtml(deviceLabel)}</b>. If this is you, enter the code on that device. It expires in ${minutes} minutes, and your other device will be signed out.</p>
  <p style="font-size:14px;line-height:1.5;margin:0;padding:12px;background:#fff4e5;border-radius:8px;color:#7a4a00"><b>Not you?</b> Don't share this code with anyone, and change your password right away (tap “Forgot password?” on the UBA login page).</p>
</div>`;
  return { subject, text, html };
}
