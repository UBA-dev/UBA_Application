// Determines whether AI-powered features (Scanner photo/PDF/Word, Dashboard
// Analyst, UBA Assistant chatbot, low-stock email alert) are unlocked for a
// tenant. Core business tools (Inventory CRUD, POS, Sales, Repair Tickets,
// CSV/Excel import, Reorder Alerts bell) are NEVER gated by this.

const TRIAL_DAYS = 14;

export function getAiAccess(tenant) {
  if (!tenant) return { allowed: false, status: "UNKNOWN", daysLeft: 0 };

  if (tenant.subscriptionStatus === "LIFETIME") {
    return { allowed: true, status: "LIFETIME", daysLeft: null };
  }

  if (tenant.subscriptionStatus === "MONTHLY") {
    if (!tenant.nextPaymentDue) {
      return { allowed: true, status: "MONTHLY", daysLeft: null };
    }
    const due = new Date(tenant.nextPaymentDue);
    const now = new Date();
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { allowed: daysLeft >= 0, status: "MONTHLY", daysLeft };
  }

  // Default: TRIAL
  const start = new Date(tenant.trialStartDate || Date.now());
  const now = new Date();
  const daysUsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const daysLeft = TRIAL_DAYS - daysUsed;
  return { allowed: daysLeft > 0, status: "TRIAL", daysLeft };
}

export function urgencyLevel(accessInfo) {
  if (accessInfo.status === "LIFETIME") return "none";
  if (accessInfo.daysLeft == null) return "none";
  if (accessInfo.daysLeft < 0) return "overdue";
  if (accessInfo.daysLeft <= 3) return "urgent";
  if (accessInfo.daysLeft <= 7) return "soon";
  return "fine";
}

export const AI_LOCKED_MESSAGE =
  "Your free AI trial has ended. Everything else in UBA keeps working as normal — contact your UBA provider to unlock AI Scanner, Business Analyst, and Assistant again.";