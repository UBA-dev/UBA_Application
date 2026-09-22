import { adminDb } from "./firebaseAdmin";
import { getPlanLimits } from "./subscription";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type UsageFeature = "scanCount" | "chatCount" | "analysisCount" | "notificationCount";

// Server-side, transactional equivalent of checkAndIncrementUsage in
// usageLimits.js. THIS is the one that actually gates the AI routes now —
// the client-side counter in usageLimits.js is only a fast local check for
// immediate UI feedback (skip the network round-trip when obviously over
// the limit) and can no longer be trusted on its own, since a tampered
// client could otherwise reset its own usage count and call the AI routes
// for free past the plan's monthly cap. A Firestore transaction (not a
// plain read-then-write) so two rapid concurrent requests can't both slip
// through past the limit.
export async function checkAndIncrementUsageServer(
  tenantId: string,
  feature: UsageFeature,
  tenant: any
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = getPlanLimits(tenant).ai[feature] ?? 0;

  if (limit <= 0) {
    return { allowed: false, count: 0, limit: 0 };
  }

  const usageRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("usage")
    .doc(currentMonthKey());

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const currentCount = snap.exists ? snap.data()?.[feature] || 0 : 0;

    if (currentCount >= limit) {
      return { allowed: false, count: currentCount, limit };
    }

    tx.set(usageRef, { [feature]: currentCount + 1 }, { merge: true });
    return { allowed: true, count: currentCount + 1, limit };
  });
}
