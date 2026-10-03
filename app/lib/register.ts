// Daily Register — cash control for Cashier accounts.
//
// Each cashier has one register. Every business day (Asia/Manila calendar
// date) that they sell or record an expense becomes a "register day":
//
//   Expected cash in drawer = opening cash on hand + cash sales − expenses
//
// To close the day the cashier must:
//   1. Deposit ALL of the previous day's cash on hand ("Cash on hand" deposit)
//   2. Deposit today's sales, keeping at most the owner's cash-on-hand limit
//   3. Download or print the day's report
// Whatever is left becomes the cash on hand (change fund) for their next
// day. A cashier can't sell on a new day until their previous day is closed,
// and after closing they can't sell again until midnight.
//
// Nothing is ever deleted — "resetting at midnight" just means the new day
// starts its own totals at zero. Every deposit needs a proof photo.

import { doc, getDoc, writeBatch, type Firestore } from "firebase/firestore";

export const BUSINESS_TIME_ZONE = "Asia/Manila";

export type PaymentMethod = "cash" | "ewallet";
export type DepositType = "sales" | "cashOnHand";

export const DEPOSIT_TYPE_LABELS: Record<DepositType, string> = {
  sales: "Sales deposit",
  cashOnHand: "Cash on hand deposit",
};

export const DEPOSIT_METHODS = [
  "Handed to owner (cash)",
  "Bank deposit",
  "GCash / e-wallet transfer",
  "Other",
] as const;

export type RegisterState = {
  cashierUid: string;
  cashierName: string;
  cashOnHand: number;
  openDayId: string | null;
  openDayDate: string | null;
  lastClosedDayId: string | null;
  lastClosedDate: string | null;
  // The closed day whose "cash on hand kept" this cash on hand came from
  // (null when the owner set it by hand).
  cashOnHandSourceDayId?: string | null;
  updatedAt?: string;
};

export type DayClosing = {
  cashSales: number;
  ewalletSales: number;
  totalSales: number;
  itemsSold: number;
  transactionCount: number;
  profit: number;
  expenses: number;
  expectedCash: number;
  cashOnHandDeposited: number;
  salesDeposited: number;
  closingCashOnHand: number;
  cashOnHandLimit: number | null;
};

export type RegisterDay = {
  id: string;
  cashierUid: string;
  cashierName: string;
  date: string;
  status: "open" | "closed";
  openingCashOnHand: number;
  openedAt: string;
  closedAt?: string | null;
  closing?: DayClosing | null;
  reportDownloadedAt?: string | null;
  reportFingerprint?: string | null;
  previousClosedDayId?: string | null;
  previousClosedDate?: string | null;
  previousClosing?: DayClosing | null;
  reopenedAt?: string | null;
  reopenReason?: string | null;
  reopenCount?: number;
};

export type RegisterSale = {
  id: string;
  itemName: string;
  quantity: number;
  price: number;
  total: number;
  profit?: number;
  date: string;
  paymentMethod?: PaymentMethod;
  paymentRef?: string | null;
  transactionId?: string;
  lateSyncFromDate?: string;
};

export type RegisterExpense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  cashierName?: string;
  receiptImage?: string | null;
};

export type RegisterDeposit = {
  id: string;
  dayId: string;
  cashierUid: string;
  cashierName: string;
  date: string;
  type: DepositType;
  amount: number;
  method: string;
  reference: string;
  proofImage: string;
  createdAt: string;
  voided: boolean;
  voidedAt?: string | null;
  voidReason?: string | null;
  voidedByName?: string | null;
  verifiedAt?: string | null;
  verifiedByName?: string | null;
};

export type RegisterAdjustment = {
  id: string;
  cashierUid: string;
  cashierName: string;
  from: number;
  to: number;
  reason: string;
  at: string;
  byName: string;
};

// ---- Money ----------------------------------------------------------------

export const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const peso = (n: number) => {
  const value = money(n);
  const decimals = Number.isInteger(value) ? 0 : 2;
  const digits = Math.abs(value).toLocaleString("en-PH", { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
  return `${value < 0 ? "−" : ""}₱${digits}`;
};
const EPSILON = 0.005;
export const sameAmount = (a: number, b: number) => Math.abs(a - b) < EPSILON;

// ---- Clock & business date ---------------------------------------------------

let clockOffsetMs = 0;

// Measures how far the phone's clock is from the server's. Offline, the phone
// clock is used as-is.
export async function syncServerClock(): Promise<void> {
  try {
    const sentAt = Date.now();
    const res = await fetch("/api/server-time", { method: "POST", cache: "no-store" });
    if (!res.ok) return;
    const { now } = await res.json();
    const receivedAt = Date.now();
    if (typeof now === "number") clockOffsetMs = now - (sentAt + receivedAt) / 2;
  } catch {
    // offline — keep the device clock
  }
}

export function nowMs(): number {
  return Date.now() + clockOffsetMs;
}

export function nowIso(): string {
  return new Date(nowMs()).toISOString();
}

// YYYY-MM-DD in Philippine time.
export function businessDate(ms: number = nowMs()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function formatBusinessDate(date: string, long = false): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: long ? "long" : "short",
    month: long ? "long" : "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---- IDs ---------------------------------------------------------------------

export const registerDayId = (cashierUid: string, date: string) => `${cashierUid}_${date}`;

export function newTransactionId(): string {
  return `T${nowMs().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}

// ---- Can this cashier sell right now? -----------------------------------------

export type RegisterGate =
  | { kind: "ok"; dayId: string; date: string; dayExists: boolean }
  | { kind: "unclosed"; dayId: string; date: string }
  | { kind: "closedToday"; dayId: string; date: string };

export function registerGate(cashierUid: string, register: RegisterState | null, today: string): RegisterGate {
  if (register?.openDayId && register.openDayDate) {
    if (register.openDayDate < today) {
      return { kind: "unclosed", dayId: register.openDayId, date: register.openDayDate };
    }
    return { kind: "ok", dayId: register.openDayId, date: register.openDayDate, dayExists: true };
  }
  if (register?.lastClosedDayId && register.lastClosedDate && register.lastClosedDate >= today) {
    return { kind: "closedToday", dayId: register.lastClosedDayId, date: register.lastClosedDate };
  }
  return { kind: "ok", dayId: registerDayId(cashierUid, today), date: today, dayExists: false };
}

// Makes sure the register day a sale/expense/deposit belongs to exists, and
// returns its id. Opening a day captures the cashier's current cash on hand.
// A sale that was saved offline and only syncs after the register already
// moved on to a newer open day is counted in that open day instead — that's
// where its cash physically is now.
export async function ensureRegisterDay(
  db: Firestore,
  tenantId: string,
  cashier: { uid: string; name: string },
  date: string
): Promise<string> {
  const dayRef = doc(db, "tenants", tenantId, "registerDays", registerDayId(cashier.uid, date));
  const regRef = doc(db, "tenants", tenantId, "registers", cashier.uid);
  const [daySnap, regSnap] = await Promise.all([getDoc(dayRef), getDoc(regRef)]);
  if (daySnap.exists()) return dayRef.id;

  const reg = regSnap.exists() ? (regSnap.data() as RegisterState) : null;
  if (reg?.openDayId && reg.openDayId !== dayRef.id) return reg.openDayId;

  const at = nowIso();
  const batch = writeBatch(db);
  batch.set(dayRef, {
    cashierUid: cashier.uid,
    cashierName: cashier.name,
    date,
    status: "open",
    // Must equal the register's cash on hand exactly (security rules check it).
    openingCashOnHand: reg?.cashOnHand ?? 0,
    openedAt: at,
    reopenCount: 0,
  });
  batch.set(
    regRef,
    {
      cashierUid: cashier.uid,
      cashierName: cashier.name,
      cashOnHand: reg?.cashOnHand ?? 0,
      openDayId: dayRef.id,
      openDayDate: date,
      lastClosedDayId: reg?.lastClosedDayId ?? null,
      lastClosedDate: reg?.lastClosedDate ?? null,
      updatedAt: at,
    },
    { merge: true }
  );
  await batch.commit();
  return dayRef.id;
}

// ---- The day's numbers -----------------------------------------------------------

export type DaySummary = {
  openingCashOnHand: number;
  cashSales: number;
  ewalletSales: number;
  totalSales: number;
  itemsSold: number;
  transactionCount: number;
  profit: number;
  expenses: number;
  // opening cash on hand + cash sales − expenses
  expectedCash: number;
  // all of the previous cash on hand, or what's left of it if expenses ate into it
  requiredCashOnHandDeposit: number;
  cashOnHandDeposited: number;
  cashOnHandDepositRemaining: number;
  // today's cash that can go into a sales deposit
  salesDepositable: number;
  salesDeposited: number;
  salesDepositRemaining: number;
  // the least that must be deposited so cash on hand stays within the limit
  minSalesDeposit: number;
  salesDepositShortfall: number;
  // what the cashier keeps for tomorrow
  closingCashOnHand: number;
  cashOnHandLimit: number | null;
  expensesExceedCash: boolean;
  overDeposited: boolean;
  cashOnHandDepositDone: boolean;
  salesDepositDone: boolean;
};

export function summarizeDay(
  openingCashOnHand: number,
  sales: RegisterSale[],
  expenses: RegisterExpense[],
  deposits: RegisterDeposit[],
  cashOnHandLimit: number | null
): DaySummary {
  const opening = money(openingCashOnHand);
  const cashSales = money(sales.filter((s) => s.paymentMethod !== "ewallet").reduce((t, s) => t + (s.total || 0), 0));
  const ewalletSales = money(sales.filter((s) => s.paymentMethod === "ewallet").reduce((t, s) => t + (s.total || 0), 0));
  const totalSales = money(cashSales + ewalletSales);
  const itemsSold = money(sales.reduce((t, s) => t + (s.quantity || 0), 0));
  const transactionCount = new Set(sales.map((s) => s.transactionId || s.date)).size;
  const profit = money(sales.reduce((t, s) => t + (s.profit || 0), 0));
  const expenseTotal = money(expenses.reduce((t, e) => t + (e.amount || 0), 0));

  const active = deposits.filter((d) => !d.voided);
  const cashOnHandDeposited = money(active.filter((d) => d.type === "cashOnHand").reduce((t, d) => t + d.amount, 0));
  const salesDeposited = money(active.filter((d) => d.type === "sales").reduce((t, d) => t + d.amount, 0));

  const expectedCash = money(opening + cashSales - expenseTotal);
  const requiredCashOnHandDeposit = money(Math.max(0, Math.min(opening, expectedCash)));
  const salesDepositable = money(Math.max(0, expectedCash - requiredCashOnHandDeposit));
  const limit = cashOnHandLimit != null && cashOnHandLimit >= 0 ? money(cashOnHandLimit) : null;
  const minSalesDeposit = limit == null ? 0 : money(Math.max(0, salesDepositable - limit));
  const closingCashOnHand = money(expectedCash - cashOnHandDeposited - salesDeposited);

  return {
    openingCashOnHand: opening,
    cashSales,
    ewalletSales,
    totalSales,
    itemsSold,
    transactionCount,
    profit,
    expenses: expenseTotal,
    expectedCash,
    requiredCashOnHandDeposit,
    cashOnHandDeposited,
    cashOnHandDepositRemaining: money(Math.max(0, requiredCashOnHandDeposit - cashOnHandDeposited)),
    salesDepositable,
    salesDeposited,
    salesDepositRemaining: money(Math.max(0, salesDepositable - salesDeposited)),
    minSalesDeposit,
    salesDepositShortfall: money(Math.max(0, minSalesDeposit - salesDeposited)),
    closingCashOnHand,
    cashOnHandLimit: limit,
    expensesExceedCash: expectedCash < -EPSILON,
    overDeposited: closingCashOnHand < -EPSILON || cashOnHandDeposited > requiredCashOnHandDeposit + EPSILON,
    cashOnHandDepositDone: sameAmount(cashOnHandDeposited, requiredCashOnHandDeposit),
    // With a limit set, depositing enough to stay within it is enough. Without
    // one, any day with cash sales still needs a sales deposit — otherwise a
    // whole day's sales could just roll over as "cash on hand".
    salesDepositDone:
      salesDeposited <= salesDepositable + EPSILON &&
      (limit != null
        ? salesDeposited + EPSILON >= minSalesDeposit
        : salesDepositable < EPSILON || salesDeposited > EPSILON),
  };
}

export function closingFromSummary(s: DaySummary): DayClosing {
  return {
    cashSales: s.cashSales,
    ewalletSales: s.ewalletSales,
    totalSales: s.totalSales,
    itemsSold: s.itemsSold,
    transactionCount: s.transactionCount,
    profit: s.profit,
    expenses: s.expenses,
    expectedCash: s.expectedCash,
    cashOnHandDeposited: s.cashOnHandDeposited,
    salesDeposited: s.salesDeposited,
    closingCashOnHand: s.closingCashOnHand,
    cashOnHandLimit: s.cashOnHandLimit,
  };
}

// The report the cashier downloads must show the same numbers they close
// with — any sale, expense or deposit after downloading needs a new report.
export function reportFingerprint(
  s: DaySummary,
  sales: RegisterSale[],
  expenses: RegisterExpense[],
  deposits: RegisterDeposit[]
): string {
  const activeDeposits = deposits.filter((d) => !d.voided).map((d) => d.id).sort();
  return [
    s.openingCashOnHand,
    s.totalSales,
    s.expenses,
    s.cashOnHandDeposited,
    s.salesDeposited,
    sales.length,
    expenses.length,
    activeDeposits.join(","),
  ].join("|");
}

// Totals recorded when the day closed vs. the records now — the owner sees a
// warning when anything was added, edited or deleted after closing.
export function changedAfterClose(day: RegisterDay | null, s: DaySummary): boolean {
  if (!day || day.status !== "closed" || !day.closing) return false;
  const c = day.closing;
  return !(
    sameAmount(c.totalSales, s.totalSales) &&
    sameAmount(c.expenses, s.expenses) &&
    sameAmount(c.cashOnHandDeposited, s.cashOnHandDeposited) &&
    sameAmount(c.salesDeposited, s.salesDeposited)
  );
}

// ---- Proof photos ----------------------------------------------------------------

// Shrinks a phone photo to a JPEG data URL small enough to store in the
// deposit record (Firestore documents max out at 1 MB).
export function compressProofImage(file: File): Promise<string> {
  const attempts = [
    { maxSize: 1280, quality: 0.72 },
    { maxSize: 1024, quality: 0.6 },
    { maxSize: 800, quality: 0.5 },
  ];
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that photo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a photo we can read."));
      img.onload = () => {
        for (const { maxSize, quality } of attempts) {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (dataUrl.length < 700_000) {
            resolve(dataUrl);
            return;
          }
        }
        reject(new Error("That photo is too large. Try taking it again a little farther away."));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
