// Monthly usage caps kada tenant para sa AI-powered features. Ang laki ng cap
// ay nakadepende sa PLAN ng tenant (tingnan ang ./plans.js at getPlanLimits).
//
// Nire-record ang count sa Firestore (tenants/{uid}/usage/{YYYY-MM}), na
// protektado ng parehong tenant-scoped rules. PAALALA: client-side pa rin ang
// pag-enforce nito, kaya hindi ito attacker-proof. Sa Phase 2, ililipat ito sa
// server. Sapat ito para hulihin ang aksidenteng overuse habang pilot.

import { doc, getDoc, setDoc, increment } from "firebase/firestore";
import { db } from "./firebase";
import { getPlanLimits } from "./subscription";

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

// Tinitingnan kung may natitira pang allowance ang tenant para sa isa pang
// tawag ng `feature` ngayong buwan. Kung meron, dinadagdagan ang count.
// Ibinabalik: { allowed, count, limit }.
// `tenant` = ang tenant document data (para malaman ang plan).
export async function checkAndIncrementUsage(uid, feature, tenant) {
  const limit = getPlanLimits(tenant).ai[feature] ?? 0;

  // Hindi kasama sa plan (limit 0) — hindi na kailangang tumingin sa database.
  if (limit <= 0) {
    return { allowed: false, count: 0, limit: 0 };
  }

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
  const label = LIMIT_LABELS[feature] || "AI features";
  if (!limit || limit <= 0) {
    return `Hindi kasama ang ${label} sa kasalukuyang plan mo. I-upgrade sa Pro (o mas mataas) sa Upgrade Plan para magamit ito.`;
  }
  return `Naubos mo na ang ${limit} ${label} ngayong buwan. Nagre-reset ito sa 1st ng susunod na buwan, o i-upgrade ang plan mo para sa mas mataas na limit.`;
}