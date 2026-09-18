// Determines whether AI-powered features (Scanner photo/PDF/Word, Dashboard
// Analyst, UBA Assistant chatbot, low-stock email alert) AND plan-gated
// business features (Repair/Delivery/P.O. Tickets, Low Stock Alerts) are
// unlocked for a tenant. Core business tools (Inventory CRUD, POS, Sales,
// CSV/Excel import) are NEVER gated by this.
//
// Aligned sa Pricing Page (Basic / Pro / Business):
//   Basic   — POS, Inventory, Sales & Expenses, Cloud Backup
//   Pro     — + AI Business Analyst, Repair & Delivery Tickets,
//              Low Stock Alerts, P.O. Tickets
//   Business— + Unlimited AI Analysis, Priority Cloud Backup,
//              Multi-Branch Support, Priority Support

const TRIAL_DAYS = 14;

export const PLAN_FEATURES = {
  basic: ["pos", "inventory", "salesExpenses", "cloudBackup"],
  pro: [
    "pos", "inventory", "salesExpenses", "cloudBackup",
    "aiFeatures", "repairTickets", "deliveryTickets", "poTickets", "lowStockAlerts",
  ],
  business: [
    "pos", "inventory", "salesExpenses", "cloudBackup",
    "aiFeatures", "repairTickets", "deliveryTickets", "poTickets", "lowStockAlerts",
    "unlimitedAi", "priorityCloudBackup", "multiBranch", "prioritySupport",
  ],
};

// IMPORTANT: default fallback kapag walang planId na naka-set.
// "business" ang ginamit dito (hindi "basic") para hindi biglang mawalan ng
// access ang mga EXISTING na paying tenant (Lifetime/Monthly) na na-set noon
// pa bago idagdag ang planId field. Once na-re-classify mo na sila gamit ang
// bagong Basic/Pro/Business buttons sa Admin, tama na ang tunay na plan nila.
const LEGACY_FALLBACK_PLAN = "business";

function planFeatureList(tenant) {
  const plan = tenant?.planId || LEGACY_FALLBACK_PLAN;
  return PLAN_FEATURES[plan] || PLAN_FEATURES[LEGACY_FALLBACK_PLAN];
}

export function getAiAccess(tenant) {
  if (!tenant) return { allowed: false, status: "UNKNOWN", daysLeft: 0 };

  if (tenant.subscriptionStatus === "LIFETIME") {
    const planIncludesAi = planFeatureList(tenant).includes("aiFeatures");
    return { allowed: planIncludesAi, status: "LIFETIME", daysLeft: null };
  }

  if (tenant.subscriptionStatus === "MONTHLY") {
    const planIncludesAi = planFeatureList(tenant).includes("aiFeatures");
    if (!tenant.nextPaymentDue) {
      return { allowed: planIncludesAi, status: "MONTHLY", daysLeft: null };
    }
    const due = new Date(tenant.nextPaymentDue);
    const now = new Date();
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { allowed: planIncludesAi && daysLeft >= 0, status: "MONTHLY", daysLeft };
  }

  // Default: TRIAL — buong access muna sa lahat (kahit Pro/Business-only
  // features) habang tumatakbo ang 14-day free trial, para maranasan nila
  // ang buong app bago pumili ng plan.
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

// --- Plan-based feature gating (bago) ---------------------------------
// Ginagamit ito para sa Repair/Delivery/P.O. Tickets, Low Stock Alerts, at
// AI features. Core tools (pos/inventory/salesExpenses/cloudBackup) ay
// hindi dapat i-check dito dahil sadyang laging TRUE ang mga iyon.
export function hasFeatureAccess(tenant, featureKey) {
  if (!tenant) return false;

  // Manual kill-switch (abuse/chargeback/non-payment na sinadya i-lock ng
  // Admin) — bina-block ang LAHAT ng plan-gated features, walang exception.
  if (tenant.manuallyDeactivated) return false;

  if (tenant.subscriptionStatus === "LIFETIME") {
    return planFeatureList(tenant).includes(featureKey);
  }

  if (tenant.subscriptionStatus === "MONTHLY") {
    if (tenant.nextPaymentDue) {
      const due = new Date(tenant.nextPaymentDue);
      if (due.getTime() < Date.now()) return false; // overdue na, wala munang access
    }
    return planFeatureList(tenant).includes(featureKey);
  }

  // TRIAL (o walang subscriptionStatus pa) — sinusunod ang parehong 14-day
  // countdown ng getAiAccess, at buong access sa lahat ng feature habang
  // tumatakbo ang trial.
  return getAiAccess(tenant).allowed;
}

export const AI_LOCKED_MESSAGE =
  "Your free AI trial has ended, or your current plan doesn't include AI features. Everything else in UBA keeps working as normal — contact your UBA provider to unlock AI Scanner, Business Analyst, and Assistant again.";

export const FEATURE_LOCKED_MESSAGE =
  "Feature na ito ay bahagi ng Pro/Business plan. I-upgrade ang plan mo o mag-renew para magamit muli — pumunta sa Settings.";