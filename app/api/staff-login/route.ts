import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/firebaseAdmin";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Dagdagan ang bilang ng maling subok. Kapag umabot sa limit, i-lock.
async function recordFailedAttempt(ref: DocumentReference) {
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = (snap.exists ? snap.data()?.count || 0 : 0) + 1;

    if (count >= MAX_ATTEMPTS) {
      tx.set(ref, { count: 0, lockedUntil: Date.now() + LOCK_MINUTES * 60 * 1000 });
    } else {
      tx.set(ref, { count, lockedUntil: 0 });
    }
  });
}

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

    // Ang bilang ng maling subok ay per shop + username. Binibilang kahit
    // hindi totoong username, para pareho ang sagot at hindi mahulaan
    // kung sino ang totoong staff.
    const attemptKey = createHash("sha256")
      .update(`${tenantId}:${normalizedUsername}`)
      .digest("hex");
    const attemptRef = adminDb.collection("loginAttempts").doc(attemptKey);

    const attemptSnap = await attemptRef.get();
    const lockedUntil: number = attemptSnap.exists ? attemptSnap.data()?.lockedUntil || 0 : 0;
    if (lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((lockedUntil - Date.now()) / 60000);
      return NextResponse.json(
        { error: `Too many wrong attempts. Please try again in ${minutesLeft} minute(s).` },
        { status: 429 }
      );
    }

    const staffQuery = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("staff")
      .where("username", "==", normalizedUsername)
      .limit(1)
      .get();

    if (staffQuery.empty) {
      await recordFailedAttempt(attemptRef);
      return NextResponse.json({ error: "Invalid username or PIN." }, { status: 401 });
    }

    const staffDoc = staffQuery.docs[0];
    const staffData = staffDoc.data();

    if (staffData.active === false) {
      return NextResponse.json({ error: "This staff account has been deactivated." }, { status: 403 });
    }

    const pinMatches = await bcrypt.compare(pin, staffData.pinHash);
    if (!pinMatches) {
      await recordFailedAttempt(attemptRef);
      return NextResponse.json({ error: "Invalid username or PIN." }, { status: 401 });
    }

    // Tamang PIN: burahin ang bilang ng maling subok
    await attemptRef.delete();

    const staffUid = `staff_${staffDoc.id}`;
    const claims = {
      isStaff: true,
      tenantId,
      role: staffData.role,
      staffId: staffDoc.id,
      staffName: staffData.name,
    };

    // Custom claims passed only to createCustomToken() are transient — they
    // vanish the moment Firebase silently refreshes the ID token (which
    // happens on page reload or roughly every hour). Persisting them via
    // setCustomUserClaims attaches them to the Auth user record itself, so
    // every future token for this staff account carries them automatically.
    try {
      await getAuth().setCustomUserClaims(staffUid, claims);
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        // First-ever login for this staff account — the Auth user doesn't
        // exist yet. Create it, then attach the claims.
        await getAuth().createUser({ uid: staffUid });
        await getAuth().setCustomUserClaims(staffUid, claims);
      } else {
        throw err;
      }
    }

    const customToken = await getAuth().createCustomToken(staffUid, claims);

    return NextResponse.json({ token: customToken, businessName, staffName: staffData.name, role: staffData.role });
  } catch (err: any) {
    console.error("staff-login error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}