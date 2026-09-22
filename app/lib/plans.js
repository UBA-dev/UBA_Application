// ISANG LUGAR LANG kung saan nakasulat ang presyo, limits, at features ng
// bawat plan. Ito ang binabasa ng Pricing page, Landing page, Admin page,
// subscription.js (access checks), usageLimits.js (AI caps), at ng
// /api/create-staff (staff cap).
//
// Kapag gusto mong baguhin ang presyo o limits sa future, DITO LANG ang edit.

export const TRIAL_DAYS = 14;

// 25% off sa annual = 9 buwan ang bayad, 12 buwan ang gamit ("3 months free").
export const ANNUAL_DISCOUNT_PERCENT = 25;
export const ANNUAL_MONTHS_PAID = 9;

// Kung walang planId ang isang paying tenant (luma pang account), ito ang
// default para hindi sila biglang mawalan ng access.
export const LEGACY_FALLBACK_PLAN = "business";

export const PLAN_IDS = ["basic", "pro", "business"];

// Ang low-stock EMAIL alert ay gagana lang para sa lahat ng customer kapag
// na-verify mo na ang sarili mong domain sa Resend (ang onboarding@resend.dev ay
// test sender lang). Habang hindi pa, naka-OFF ito at hindi ina-advertise.
// Kapag handa na: i-verify ang domain, itakda ang ALERT_FROM_EMAIL sa Vercel, at
// gawing true ito.
export const EMAIL_ALERTS_READY = false;

// ── Features na kasama kada plan ─────────────────────────────────────────
// Ang mga key na ito ay ginagamit ng hasFeatureAccess(tenant, key).
const CORE = ["pos", "inventory", "salesExpenses", "cloudBackup"];
const BASIC_FEATURES = [...CORE, "lowStockAlerts", "aiFeatures"];
const PRO_FEATURES = [
  ...BASIC_FEATURES,
  "repairTickets",
  "deliveryTickets",
  "poTickets",
  ...(EMAIL_ALERTS_READY ? ["lowStockEmail"] : []),
];
const BUSINESS_FEATURES = [...PRO_FEATURES, "prioritySupport", "assistedSetup"];

// ── AI caps kada buwan (nagre-reset tuwing 1st) ──────────────────────────
// scanCount         = AI Scanner (photo/PDF/Word)
// chatCount         = UBA Assistant messages
// analysisCount     = "Analyze My Business" sa Dashboard
// notificationCount = AI-drafted customer messages
export const PLANS = {
  basic: {
    id: "basic",
    name: "Basic",
    tagline: "Everything your store needs",
    monthly: 499,
    annual: 499 * ANNUAL_MONTHS_PAID, // ₱4,491
    staffCap: 3,
    itemCap: Infinity,
    ai: { scanCount: 10, chatCount: 20, analysisCount: 0, notificationCount: 0 },
    features: BASIC_FEATURES,
    highlights: [
      "POS that works even offline",
      "Unlimited items and sales history",
      "Up to 3 staff logins (with roles and approvals)",
      "Expense and profit tracking, CSV/Excel import",
      "Low-stock alert in the app",
      "UBA Starter: 10 scans + 20 assistant messages per month",
      "Support by email/Messenger",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For repair and service shops",
    monthly: 999,
    annual: 999 * ANNUAL_MONTHS_PAID, // ₱8,991
    staffCap: 8,
    itemCap: Infinity,
    ai: { scanCount: 60, chatCount: 100, analysisCount: 20, notificationCount: 60 },
    features: PRO_FEATURES,
    highlights: [
      "Everything in Basic",
      "Repair, Delivery, and P.O. Tickets",
      "UBA Business Analyst (20 per month)",
      "UBA Scanner (60) and Assistant (100) per month",
      "UBA-drafted messages to customers",
      ...(EMAIL_ALERTS_READY ? ["Low-stock alert by email"] : []),
      "Up to 8 staff logins",
      "Faster support (~1 business day)",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "For teams with high sales volume",
    monthly: 1499,
    annual: 1499 * ANNUAL_MONTHS_PAID, // ₱13,491
    staffCap: 25,
    itemCap: Infinity,
    ai: { scanCount: 120, chatCount: 200, analysisCount: 40, notificationCount: 120 },
    features: BUSINESS_FEATURES,
    highlights: [
      "Everything in Pro",
      "2× the UBA allowance (120 scans, 200 messages, 40 analyses)",
      "Up to 25 staff logins",
      "Priority support (~4 business hours)",
      "Free assisted setup: we import your inventory for you",
    ],
  },
};

// Pagkatapos ng trial o pag-expire ng bayad: hindi nawawala ang data, at
// gumagana pa rin ang POS. Limitado lang ang dami at wala na ang AI at tickets.
export const FREE_LIMITS = {
  itemCap: 50,
  staffCap: 0,
  ai: { scanCount: 0, chatCount: 0, analysisCount: 0, notificationCount: 0 },
  features: CORE,
};

// Habang trial: buong access, pero may cap ang AI (parang Pro) para hindi
// malugi sa mga hindi bumibili.
export const TRIAL_LIMITS = {
  itemCap: Infinity,
  staffCap: PLANS.pro.staffCap,
  ai: PLANS.pro.ai,
};

// ── Paano magbayad (manual, habang wala pa ang online payment) ───────────
// PUNAN MO ITO. Ang walang laman ay hindi ipapakita sa Pricing page.
export const PAYMENT_INFO = {
  mayaName: "Zoren Galagnao",
  mayaNumber: "0963 750 8043",
  gcashName: "Jeric Galagnao",
  gcashNumber: "0963 750 8043",
  bankName: "BanKo (a subsidiary of BPI)",
  bankAccountName: "Zoren Ponce Galagnao",
  bankAccountNumber: "1800 2339 0785",
  contactLabel: "Message on Facebook",
  contactUrl: "https://www.facebook.com/zorenponce.galagnao",
  activationNote: "Your plan will be activated within 1 business day after we verify your payment.",
};

// ── Helpers ──────────────────────────────────────────────────────────────
export function peso(amount) {
  return "₱" + String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function planPrice(planId, cycle) {
  const plan = PLANS[planId];
  if (!plan) return 0;
  return cycle === "annual" ? plan.annual : plan.monthly;
}

export function annualPerMonth(planId) {
  const plan = PLANS[planId];
  return plan ? Math.round(plan.annual / 12) : 0;
}

export function annualSavings(planId) {
  const plan = PLANS[planId];
  return plan ? plan.monthly * 12 - plan.annual : 0;
}

export function cycleDays(cycle) {
  return cycle === "annual" ? 365 : 30;
}

export function cycleLabel(cycle) {
  return cycle === "annual" ? "Annual" : "Monthly";
}
