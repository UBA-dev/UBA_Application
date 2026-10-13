import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "./firebaseAdmin";
import { OWNER_SESSIONS } from "./ownerSecurity";

// The shop (tenant) and role a verified request is allowed to act as.
// For an Owner, tenantId is just their own uid. For staff (who sign in
// with a custom token carrying these claims — see staffAuth.ts on the
// client side), tenantId points back to the Owner's shop.
export type ApiSession = {
  uid: string;
  tenantId: string;
  isStaff: boolean;
  role: "owner" | "secretary" | "cashier";
  staffId?: string;
  staffName?: string;
  // When this sign-in happened (seconds) — identifies the Owner's device sign-in.
  authTime: number;
  email?: string;
};

type SessionResult = { ok: true; session: ApiSession } | { ok: false; response: NextResponse };

type SessionOptions = {
  // Only the owner-security routes, which a new device must reach in order
  // to verify itself, accept an Owner sign-in that isn't the active one.
  allowInactiveOwner?: boolean;
};

// Verifies the Firebase ID token sent in the Authorization header and
// resolves it to a session. Every API route that touches tenant data,
// calls a paid AI feature, or sends email/notifications on the Owner's
// behalf should call this FIRST — before this, those routes trusted a
// plain `userId` field in the request body, which anyone could fake to
// use (and bill) another shop's AI usage.
export async function requireSession(req: NextRequest, options: SessionOptions = {}): Promise<SessionResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not logged in" }, { status: 401 }),
    };
  }

  const idToken = authHeader.slice("Bearer ".length);

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    const claims = decoded as any;

    if (claims.isStaff) {
      return {
        ok: true,
        session: {
          uid: decoded.uid,
          tenantId: claims.tenantId,
          isStaff: true,
          role: claims.role,
          staffId: claims.staffId,
          staffName: claims.staffName,
          authTime: decoded.auth_time,
        },
      };
    }

    // One active Owner device at a time (see ownerSecurity.ts).
    if (!options.allowInactiveOwner) {
      const sessionSnap = await adminDb.collection(OWNER_SESSIONS).doc(decoded.uid).get();
      if (sessionSnap.exists && sessionSnap.data()?.activeAuthTime !== decoded.auth_time) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Your UBA account is now open on another device. Please log in again.", code: "inactive-device" },
            { status: 401 }
          ),
        };
      }
    }

    return {
      ok: true,
      session: {
        uid: decoded.uid,
        tenantId: decoded.uid,
        isStaff: false,
        role: "owner",
        authTime: decoded.auth_time,
        email: decoded.email,
      },
    };
  } catch (err) {
    console.error("requireSession: invalid or expired token", err);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your session has expired. Please log in again." },
        { status: 401 }
      ),
    };
  }
}

// Same check, but rejects staff accounts — for actions that only the
// business Owner should ever be able to do (managing staff, viewing the
// Shop Code, changing subscription/billing, etc).
export async function requireOwnerSession(req: NextRequest, options: SessionOptions = {}): Promise<SessionResult> {
  const result = await requireSession(req, options);
  if (!result.ok) return result;
  if (result.session.isStaff) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only the business owner can do this." },
        { status: 403 }
      ),
    };
  }
  return result;
}
