// Soft, client-enforced monthly usage caps per tenant for AI-powered features.
// Tracks counts in Firestore (tenants/{uid}/usage/{YYYY-MM}), protected by the
// same tenant-scoped security rules as everything else — a tenant can only
// read/write their OWN usage doc. This is not attacker-proof (a determined
// user could bypass it client-side), but it catches accidental overuse/bugs,
// which is the real risk during the manual pilot phase.

import { doc, getDoc, setDoc, increment } from "firebase/firestore";
import { db } from "./firebase";

export const MONTHLY_LIMITS = {
  scanCount: 100, // Universal Scanner (photo/PDF/Word)
  chatCount: 150, // UBA Assistant messages
  analysisCount: 60, // Dashboard "Analyze My Business"
  notificationCount: 100, // AI-drafted customer notifications
};

export const LIMIT_LABELS = {
  scanCount: "AI scans",
  chatCount: "assistant messages",
  analysisCount: "business analyses",
  notificationCount: "customer notifications",
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Checks whether the tenant still has room for one more call of `feature`
// this month. If allowed, increments the count. Returns { allowed, count, limit }.
export async function checkAndIncrementUsage(uid, feature) {
  const limit = MONTHLY_LIMITS[feature];
  const usageRef = doc(db, "tenants", uid, "usage", currentMonthKey());

  const snap = await getDoc(usageRef);
  const currentCount = snap.exists() ? snap.data()[feature] || 0 : 0;

  if (currentCount >= limit) {
    return { allowed: false, count: currentCount, limit };
  }

  await setDoc(usageRef, { [feature]: increment(1) }, { merge: true });
  return { allowed: true, count: currentCount + 1, limit };
}

export function usageLimitMessage(feature, limit) {
  return `You've used all ${limit} ${LIMIT_LABELS[feature]} for this month. This resets on the 1st — contact your UBA provider if you need a higher limit.`;
}