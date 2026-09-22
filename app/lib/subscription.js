// Determines what a tenant may use, based on their plan (Basic / Pro /
// Business), trial, and payment status. Ang lahat ng presyo, limits, at
// features ay nakasulat sa ./plans.js — dito lang ang LOGIC.
//
// Plans (tingnan ang plans.js para sa buong detalye):
//   Free     — POS, Inventory (50 items), Sales & Expenses, Cloud Backup
//   Basic    — + unlimited items, 3 staff, low-stock alert, AI Starter
//   Pro      — + Repair/Delivery/P.O. Tickets, AI Analyst, low-stock email, 8 staff
//   Business — + 2× AI allowance, 25 staff, priority support, assisted setup
//
// Core business tools (POS, Inventory, Sales) ay HINDI kailanman nila-lock ng
// file na ito. Limits lang sa dami (items, staff) at AI/tickets ang naka-gate.
//
// subscriptionStatus values sa database:
//   "TRIAL"    — 7-day free trial, buong access
//   "MONTHLY"  — bayad na (monthly O annual — tingnan ang billingCycle at
//                nextPaymentDue). Pinanatili ang pangalan para hindi masira
//                ang mga lumang tenant record.
//   "LIFETIME" — LEGACY lang. Hindi na inaalok. Ang mga lumang tenant na
//                may ganito ay patuloy na gagana hanggang i-set sila ng
//                Admin sa Monthly/Annual plan.

import {
  PLANS,
  FREE_LIMITS,
  TRIAL_LIMITS,
  TRIAL_DAYS,
  LEGACY_FALLBACK_PLAN,
} from "./plans";

export { TRIAL_DAYS };

// Para sa compatibility: PLAN_FEATURES[planId] = listahan ng feature keys
export const PLAN_FEATURES = {
  basic: PLANS.basic.features,
  pro: PLANS.pro.features,
  business: PLANS.business.features,
};

// trialStartDate is a Firestore server Timestamp for new accounts (see
// onboarding), but older tenants may still have it stored as the legacy ISO
// string this app used before. Handles both, and missing entirely (before
// the field ever finishes writing right after signup).
function toDate(value) {
  if (!value) return new Date();
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

function isPaidStatus(tenant) {
  return tenant?.subscriptionStatus === "MONTHLY" || tenant?.subscriptionStatus === "LIFETIME";
}

function paidPlanId(tenant) {
  return tenant?.planId && PLANS[tenant.planId] ? tenant.planId : LEGACY_FALLBACK_PLAN;
}

function planFeatureList(tenant) {
  return PLAN_FEATURES[paidPlanId(tenant)];
}

function isPastDue(tenant) {
  if (tenant?.subscriptionStatus !== "MONTHLY" || !tenant.nextPaymentDue) return false;
  return new Date(tenant.nextPaymentDue).getTime() < Date.now();
}

export function getBillingCycle(tenant) {
  return tenant?.billingCycle === "annual" ? "annual" : "monthly";
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

  // Default: TRIAL — buong access habang tumatakbo ang 7-day free trial,
  // para maranasan nila ang buong app bago pumili ng plan.
  const start = toDate(tenant.trialStartDate);
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

// --- Plan-based feature gating ------------------------------------------
// Ginagamit para sa Tickets, Low Stock Email, AI features, atbp.
// Core tools (pos/inventory/salesExpenses/cloudBackup) ay hindi dapat i-check
// dito dahil laging TRUE ang mga iyon.
export function hasFeatureAccess(tenant, featureKey) {
  if (!tenant) return false;

  // Manual kill-switch (abuse/chargeback/non-payment na sinadya i-lock ng
  // Admin) — bina-block ang LAHAT ng plan-gated features, walang exception.
  if (tenant.manuallyDeactivated) return false;

  if (tenant.subscriptionStatus === "LIFETIME") {
    return planFeatureList(tenant).includes(featureKey);
  }

  if (tenant.subscriptionStatus === "MONTHLY") {
    if (isPastDue(tenant)) return false; // expired na, wala munang access
    return planFeatureList(tenant).includes(featureKey);
  }

  // TRIAL (o walang subscriptionStatus pa) — buong access habang tumatakbo
  // ang trial.
  return getAiAccess(tenant).allowed;
}

// --- Limits (dami ng items, staff, at AI kada buwan) ----------------------
// Ibinabalik: { key, itemCap, staffCap, ai: { scanCount, chatCount, ... } }
// key = "basic" | "pro" | "business" | "trial" | "free" | "loading"
export function getPlanLimits(tenant) {
  // Wala pang tenant data (naglo-load pa) — huwag muna mag-block.
  if (!tenant) return { key: "loading", ...TRIAL_LIMITS };

  if (tenant.manuallyDeactivated) return { key: "free", ...FREE_LIMITS };

  if (isPaidStatus(tenant)) {
    if (isPastDue(tenant)) return { key: "free", ...FREE_LIMITS };
    const plan = PLANS[paidPlanId(tenant)];
    return { key: plan.id, itemCap: plan.itemCap, staffCap: plan.staffCap, ai: plan.ai };
  }

  return getAiAccess(tenant).allowed
    ? { key: "trial", ...TRIAL_LIMITS }
    : { key: "free", ...FREE_LIMITS };
}

// Maikling label para sa Dashboard/Sidebar/Admin.
// tone: "paid" | "trial" | "free" | "overdue" | "off"
export function getPlanLabel(tenant) {
  if (!tenant) return { text: "…", tone: "free" };
  if (tenant.manuallyDeactivated) return { text: "Deactivated", tone: "off" };

  if (isPaidStatus(tenant)) {
    const plan = PLANS[paidPlanId(tenant)];
    const cycle = getBillingCycle(tenant) === "annual" ? " · Annual" : "";
    if (isPastDue(tenant)) return { text: `${plan.name}${cycle} · Expired`, tone: "overdue" };
    return { text: `${plan.name}${cycle}`, tone: "paid" };
  }

  const info = getAiAccess(tenant);
  if (info.allowed) return { text: `Free Trial · ${info.daysLeft} days left`, tone: "trial" };
  return { text: "Free", tone: "free" };
}

export function itemCapMessage(cap) {
  return `You've reached the ${cap} item limit of the Free plan. Upgrade to Basic (unlimited items) in Upgrade Plan to add more. Your items are safe and won't be lost.`;
}

export function staffCapMessage(cap, planName) {
  if (cap <= 0) {
    return "Staff logins are not included in the Free plan. Upgrade to Basic or higher to add staff.";
  }
  return `You've reached the ${cap} staff login limit of the ${planName} plan. Upgrade your plan to add more.`;
}

export const AI_LOCKED_MESSAGE =
  "Your free trial has ended, or these features are not included in your current plan. Everything else in UBA still works — go to Upgrade Plan to unlock the UBA Scanner, UBA Business Analyst, and UBA Assistant again.";

export const FEATURE_LOCKED_MESSAGE =
  "This feature is for the Pro/Business plan. Upgrade your plan or renew — go to Upgrade Plan.";