// Monthly usage caps kada tenant para sa AI-powered features. Ang laki ng cap
// ay nakadepende sa PLAN ng tenant (tingnan ang ./plans.js at getPlanLimits).
//
// Ang aktwal na pag-check-at-increment ay server-side na ngayon (tingnan ang
// ./usageLimitsAdmin.ts, ginagamit ng mga AI API routes) — dito na lang
// nananatili ang mga shared na label/message na ginagamit pareho ng client
// (para sa display) at ng server (para sa error responses).

export const LIMIT_LABELS = {
  scanCount: "UBA scans",
  chatCount: "assistant messages",
  analysisCount: "business analyses",
  notificationCount: "customer notifications",
};

export function usageLimitMessage(feature, limit) {
  const label = LIMIT_LABELS[feature] || "UBA features";
  if (!limit || limit <= 0) {
    return `${label} is not included in your current plan. Upgrade to Pro (or higher) in Upgrade Plan to use this.`;
  }
  return `You've used all ${limit} ${label} this month. This resets on the 1st of next month, or upgrade your plan for a higher limit.`;
}
