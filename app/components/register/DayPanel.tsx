"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Role } from "../../lib/permissions";
import {
  DEPOSIT_TYPE_LABELS,
  changedAfterClose,
  closingFromSummary,
  ensureRegisterDay,
  formatBusinessDate,
  formatDateTime,
  formatTime,
  nowIso,
  peso,
  reportFingerprint,
  summarizeDay,
  type DepositType,
  type RegisterDay,
  type RegisterDeposit,
  type RegisterExpense,
  type RegisterSale,
  type RegisterState,
} from "../../lib/register";
import { downloadRegisterExcel, printRegisterReport, type RegisterReportData } from "../../lib/registerReport";
import { DepositModal, ExpenseModal, ReasonModal } from "./RegisterModals";
import {
  Notice,
  PhotoViewer,
  Pill,
  StatCard,
  TONES,
  cardStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from "./ui";

export type RegisterViewer = { uid: string; name: string; role: Role };

const SALES_PREVIEW = 8;

export default function DayPanel({
  tenantId,
  viewer,
  cashier,
  dayId,
  date,
  today,
  register,
  cashOnHandLimit,
  businessName,
  logoUrl,
  isActiveDay,
  pendingOfflineSales = 0,
}: {
  tenantId: string;
  viewer: RegisterViewer;
  cashier: { uid: string; name: string };
  dayId: string;
  date: string;
  today: string;
  register: RegisterState | null;
  cashOnHandLimit: number | null;
  businessName: string;
  logoUrl: string | null;
  // The day the cashier can still sell and record into: their open day, or
  // today before their first sale. Older days are read-only.
  isActiveDay: boolean;
  pendingOfflineSales?: number;
}) {
  const [day, setDay] = useState<RegisterDay | null>(null);
  const [dayLoaded, setDayLoaded] = useState(false);
  const [sales, setSales] = useState<RegisterSale[]>([]);
  const [expenses, setExpenses] = useState<RegisterExpense[]>([]);
  const [deposits, setDeposits] = useState<RegisterDeposit[]>([]);

  const [depositType, setDepositType] = useState<DepositType | null>(null);
  const [showExpense, setShowExpense] = useState(false);
  const [voiding, setVoiding] = useState<RegisterDeposit | null>(null);
  const [reopening, setReopening] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [viewing, setViewing] = useState<{ src: string; caption: string } | null>(null);
  const [showAllSales, setShowAllSales] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);

  const isOwnView = viewer.role === "cashier" && viewer.uid === cashier.uid;
  const isOwner = viewer.role === "owner";
  const includeProfit = viewer.role !== "cashier";

  // Parents render this with key={dayId}, so each day starts with fresh state.
  useEffect(() => {
    const dayRef = doc(db, "tenants", tenantId, "registerDays", dayId);
    const unsubDay = onSnapshot(
      dayRef,
      (snap) => {
        setDay(snap.exists() ? ({ id: snap.id, ...snap.data() } as RegisterDay) : null);
        setDayLoaded(true);
      },
      (err) => {
        console.error("register day:", err);
        setDayLoaded(true);
      }
    );
    const unsubSales = onSnapshot(
      query(collection(db, "tenants", tenantId, "sales"), where("registerDayId", "==", dayId)),
      (snap) => setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegisterSale)),
      (err) => console.error("register sales:", err)
    );
    const unsubExpenses = onSnapshot(
      query(collection(db, "tenants", tenantId, "expenses"), where("registerDayId", "==", dayId)),
      (snap) => setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegisterExpense)),
      (err) => console.error("register expenses:", err)
    );
    // Cashiers may only list their own deposits, so their query has to say so.
    const depositsCol = collection(db, "tenants", tenantId, "registerDeposits");
    const depositsQuery = isOwnView
      ? query(depositsCol, where("cashierUid", "==", viewer.uid), where("dayId", "==", dayId))
      : query(depositsCol, where("dayId", "==", dayId));
    const unsubDeposits = onSnapshot(
      depositsQuery,
      (snap) => setDeposits(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegisterDeposit)),
      (err) => console.error("register deposits:", err)
    );

    return () => {
      unsubDay();
      unsubSales();
      unsubExpenses();
      unsubDeposits();
    };
  }, [tenantId, dayId, isOwnView, viewer.uid]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const status: "open" | "closed" = day?.status ?? "open";
  const opening = day?.openingCashOnHand ?? register?.cashOnHand ?? 0;
  const limit = status === "closed" && day?.closing ? day.closing.cashOnHandLimit ?? null : cashOnHandLimit;
  const summary = useMemo(
    () => summarizeDay(opening, sales, expenses, deposits, limit),
    [opening, sales, expenses, deposits, limit]
  );
  const fingerprint = reportFingerprint(summary, sales, expenses, deposits);
  const reportCurrent = !!day?.reportDownloadedAt && day.reportFingerprint === fingerprint;
  const changed = changedAfterClose(day, summary);

  const canCashierAct = isOwnView && isActiveDay && status === "open";
  const hasActivity = !!day || sales.length > 0 || expenses.length > 0 || deposits.length > 0;
  const depositsDone = summary.cashOnHandDepositDone && summary.salesDepositDone && !summary.overDeposited;
  const canClose =
    canCashierAct && !!day && depositsDone && reportCurrent && online && pendingOfflineSales === 0;
  const canReopen =
    isOwner &&
    status === "closed" &&
    register?.lastClosedDayId === dayId &&
    !register?.openDayId;

  const dayRef = doc(db, "tenants", tenantId, "registerDays", dayId);
  const regRef = doc(db, "tenants", tenantId, "registers", cashier.uid);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Check your internet connection and try again.");
    } finally {
      setBusy("");
    }
  };

  const ensureDay = async () => {
    const id = await ensureRegisterDay(db, tenantId, cashier, date);
    if (id !== dayId) throw new Error(`Register moved to ${id}`);
    return id;
  };

  const submitDeposit = async (
    type: DepositType,
    input: { amount: number; method: string; reference: string; proofImage: string }
  ) => {
    const id = await ensureDay();
    await addDoc(collection(db, "tenants", tenantId, "registerDeposits"), {
      dayId: id,
      cashierUid: cashier.uid,
      cashierName: cashier.name,
      date,
      type,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      proofImage: input.proofImage,
      createdAt: nowIso(),
      voided: false,
    });
  };

  const submitExpense = async (input: { description: string; amount: number; receiptImage: string | null }) => {
    const id = await ensureDay();
    await addDoc(collection(db, "tenants", tenantId, "expenses"), {
      description: input.description,
      amount: input.amount,
      date: nowIso(),
      cashierUid: cashier.uid,
      cashierName: cashier.name,
      registerDayId: id,
      source: "register",
      ...(input.receiptImage ? { receiptImage: input.receiptImage } : {}),
    });
  };

  const removeExpense = (e: RegisterExpense) => {
    if (!confirm(`Remove the expense "${e.description}" (${peso(e.amount)})?`)) return;
    run("expense", () => deleteDoc(doc(db, "tenants", tenantId, "expenses", e.id)));
  };

  const voidDeposit = async (d: RegisterDeposit, reason: string) => {
    await updateDoc(doc(db, "tenants", tenantId, "registerDeposits", d.id), {
      voided: true,
      voidedAt: nowIso(),
      voidReason: reason,
      voidedByName: viewer.name,
    });
  };

  const verifyDeposit = (d: RegisterDeposit) =>
    run("verify", () =>
      updateDoc(doc(db, "tenants", tenantId, "registerDeposits", d.id), {
        verifiedAt: nowIso(),
        verifiedByName: viewer.name,
      })
    );

  const reportData = (): RegisterReportData => ({
    businessName,
    logoUrl,
    cashierName: cashier.name,
    date,
    day,
    summary,
    sales,
    expenses,
    deposits,
    includeProfit,
    generatedByName: isOwner && viewer.name !== "Owner" ? `${viewer.name} (Owner)` : viewer.name,
    changedAfterClose: changed,
  });

  // Downloading/printing from the closing checklist is what unlocks "Close day".
  const markReportDownloaded = async () => {
    if (!canCashierAct || !day) return;
    await updateDoc(dayRef, { reportDownloadedAt: nowIso(), reportFingerprint: fingerprint });
  };

  const handlePrint = () => {
    if (printRegisterReport(reportData())) run("report", markReportDownloaded);
  };

  const handleExcel = () =>
    run("report", async () => {
      await downloadRegisterExcel(reportData());
      await markReportDownloaded();
    });

  const closeDay = () =>
    run("close", async () => {
      if (!canClose || !day) return;
      const at = nowIso();
      const keepLatest = !!register?.lastClosedDate && register.lastClosedDate > date;
      const batch = writeBatch(db);
      batch.update(dayRef, {
        status: "closed",
        closedAt: at,
        closing: closingFromSummary(summary),
        previousClosedDayId: register?.lastClosedDayId ?? null,
        previousClosedDate: register?.lastClosedDate ?? null,
      });
      batch.set(
        regRef,
        {
          cashierUid: cashier.uid,
          cashierName: cashier.name,
          cashOnHand: summary.closingCashOnHand,
          cashOnHandSourceDayId: dayId,
          openDayId: null,
          openDayDate: null,
          lastClosedDayId: keepLatest ? register!.lastClosedDayId : dayId,
          lastClosedDate: keepLatest ? register!.lastClosedDate : date,
          updatedAt: at,
        },
        { merge: true }
      );
      await batch.commit();
      setConfirmClose(false);
    });

  const reopenDay = async (reason: string) => {
    if (!canReopen || !day) return;
    const at = nowIso();
    const batch = writeBatch(db);
    batch.update(dayRef, {
      status: "open",
      closedAt: null,
      closing: null,
      previousClosing: day.closing ?? null,
      reportDownloadedAt: null,
      reportFingerprint: null,
      reopenedAt: at,
      reopenReason: reason,
      reopenCount: (day.reopenCount || 0) + 1,
    });
    batch.set(
      regRef,
      {
        cashOnHand: day.openingCashOnHand,
        cashOnHandSourceDayId: day.previousClosedDayId ?? null,
        openDayId: dayId,
        openDayDate: day.date,
        lastClosedDayId: day.previousClosedDayId ?? null,
        lastClosedDate: day.previousClosedDate ?? null,
        updatedAt: at,
      },
      { merge: true }
    );
    await batch.commit();
  };

  if (!dayLoaded) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: "var(--color-text-secondary)" }}>
        Loading register...
      </p>
    );
  }

  const sortedSales = [...sales].sort((a, b) => b.date.localeCompare(a.date));
  const sortedExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const sortedDeposits = [...deposits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visibleSales = showAllSales ? sortedSales : sortedSales.slice(0, SALES_PREVIEW);
  const unverified = deposits.filter((d) => !d.voided && !d.verifiedAt).length;

  const statusPill =
    status === "closed" ? (
      <Pill tone="green">Closed · {formatTime(day?.closedAt)}</Pill>
    ) : hasActivity ? (
      <Pill tone="yellow">Open</Pill>
    ) : (
      <Pill tone="gray">No sales yet</Pill>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            {cashier.name} · Business day
          </p>
          <h2 className="text-base sm:text-lg font-bold leading-snug" style={{ color: "var(--color-text-primary)" }}>
            {formatBusinessDate(date, true)}
          </h2>
        </div>
        {statusPill}
      </div>

      {changed && !isOwnView && (
        <Notice tone="red">
          ⚠ Records for this day were added, edited or deleted after it was closed. Download the report to compare
          the totals at closing with the records now.
        </Notice>
      )}
      {(day?.reopenCount || 0) > 0 && (
        <Notice tone="yellow">
          This day was reopened by the owner {day!.reopenCount} time(s)
          {day?.reopenReason ? ` — last reason: “${day.reopenReason}”` : ""}.
        </Notice>
      )}
      {summary.expensesExceedCash && (
        <Notice tone="red">Expenses are higher than the cash in the drawer. Check that each expense is correct.</Notice>
      )}
      {summary.overDeposited && !summary.expensesExceedCash && (
        <Notice tone="red">
          More was deposited than the drawer should have. One of the deposits or expenses is probably wrong — void
          the wrong deposit and save it again.
        </Notice>
      )}
      {sales.some((s) => s.lateSyncFromDate) && (
        <Notice tone="yellow">Some sales made offline on an earlier day were synced into this day.</Notice>
      )}
      {error && <Notice tone="red">{error}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Opening cash on hand" value={peso(summary.openingCashOnHand)} hint="Kept from previous day" />
        <StatCard
          label="Cash sales"
          value={peso(summary.cashSales)}
          hint={`${summary.transactionCount} transaction${summary.transactionCount === 1 ? "" : "s"}`}
        />
        <StatCard label="Expenses" value={peso(summary.expenses)} tone="red" hint="Paid from the drawer" />
        <StatCard label="Expected cash in drawer" value={peso(summary.expectedCash)} emphasize />
        <StatCard label="GCash / e-wallet sales" value={peso(summary.ewalletSales)} hint="Not in the drawer" />
        <StatCard label="Total sales" value={peso(summary.totalSales)} hint={`${summary.itemsSold} item(s) sold`} />
        <StatCard
          label="Deposited"
          value={peso(summary.cashOnHandDeposited + summary.salesDeposited)}
          hint={`Cash on hand ${peso(summary.cashOnHandDeposited)} · Sales ${peso(summary.salesDeposited)}`}
        />
        <StatCard
          label={status === "closed" ? "Cash on hand kept" : "Cash on hand to keep"}
          value={peso(summary.closingCashOnHand)}
          tone="green"
          emphasize
          hint="Change fund for the next day"
        />
        {includeProfit && (
          <StatCard
            label="Gross profit"
            value={peso(summary.profit)}
            tone="green"
            hint={`Net after expenses ${peso(summary.profit - summary.expenses)}`}
          />
        )}
      </div>

      {/* ---- Closing checklist (the cashier's own open day) ---- */}
      {canCashierAct && (
        <div className="p-4 space-y-3" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              🔒 Close the day
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              Do these in order at the end of your shift. You can&apos;t sell on the next day until this day is closed.
            </p>
          </div>

          {!hasActivity ? (
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Nothing to close yet — sales and expenses you record today will show up here.
            </p>
          ) : (
            <ol className="space-y-3">
              <ChecklistStep
                n={1}
                done={summary.cashOnHandDepositDone}
                title="Deposit the previous cash on hand"
                detail={
                  summary.requiredCashOnHandDeposit > 0
                    ? summary.cashOnHandDepositDone
                      ? `Deposited ${peso(summary.cashOnHandDeposited)} ✓`
                      : `Deposit all ${peso(summary.requiredCashOnHandDeposit)} you kept from the previous day${
                          summary.cashOnHandDeposited > 0 ? ` (${peso(summary.cashOnHandDepositRemaining)} left)` : ""
                        }.`
                    : summary.openingCashOnHand > 0
                    ? "Nothing left of the previous cash on hand to deposit — expenses used it up ✓"
                    : "No cash on hand from the previous day ✓"
                }
                action={
                  !summary.cashOnHandDepositDone && summary.cashOnHandDepositRemaining > 0
                    ? { label: `Deposit ${peso(summary.cashOnHandDepositRemaining)}`, onClick: () => setDepositType("cashOnHand") }
                    : undefined
                }
              />
              <ChecklistStep
                n={2}
                done={summary.salesDepositDone}
                title="Deposit today's sales"
                detail={
                  summary.salesDepositable <= 0
                    ? "No sales cash to deposit ✓"
                    : `${peso(summary.salesDepositable)} of today's sales cash. ${
                        summary.cashOnHandLimit != null
                          ? `Keep at most ${peso(summary.cashOnHandLimit)} — deposit at least ${peso(summary.minSalesDeposit)}.`
                          : "What you don't deposit stays with you as cash on hand for tomorrow."
                      } Deposited so far: ${peso(summary.salesDeposited)}.`
                }
                action={
                  summary.salesDepositRemaining > 0
                    ? {
                        label: summary.salesDeposited > 0 ? "Add sales deposit" : "Deposit sales",
                        onClick: () => setDepositType("sales"),
                      }
                    : undefined
                }
              />
              <li className="flex gap-3">
                <StepNumber n={3} done={reportCurrent} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Download or print today&apos;s report
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    {!depositsDone
                      ? "Finish the deposits first so they're included in the report."
                      : reportCurrent
                      ? `Downloaded ${formatTime(day?.reportDownloadedAt)} ✓`
                      : day?.reportDownloadedAt
                      ? "Something changed after your last download — download it again."
                      : "Give the printed or saved report to the owner."}
                  </p>
                  {depositsDone && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        onClick={handlePrint}
                        disabled={!!busy}
                        className="px-3 py-2 text-xs font-semibold disabled:opacity-50"
                        style={secondaryButtonStyle}
                      >
                        🖨️ Print / Save PDF
                      </button>
                      <button
                        onClick={handleExcel}
                        disabled={!!busy}
                        className="px-3 py-2 text-xs font-semibold disabled:opacity-50"
                        style={secondaryButtonStyle}
                      >
                        📊 Download Excel
                      </button>
                    </div>
                  )}
                </div>
              </li>
              <li className="flex gap-3">
                <StepNumber n={4} done={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Close the day
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    {pendingOfflineSales > 0
                      ? `${pendingOfflineSales} sale(s) saved offline aren't synced yet — open POS while online and tap Sync Now.`
                      : !online
                      ? "You're offline. Connect to the internet to close the day."
                      : `You'll keep ${peso(summary.closingCashOnHand)} as cash on hand for your next day.`}
                  </p>
                  <button
                    onClick={() => setConfirmClose(true)}
                    disabled={!canClose || !!busy}
                    className="mt-2 w-full sm:w-auto px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
                    style={{ ...primaryButtonStyle, background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
                  >
                    ✓ Close day
                  </button>
                </div>
              </li>
            </ol>
          )}
        </div>
      )}

      {/* ---- Report & owner tools (everyone else, and the cashier's closed days) ---- */}
      {!canCashierAct && hasActivity && (
        <div className="p-4 space-y-3" style={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              📄 Day report
            </p>
            {!isOwnView && unverified > 0 && <Pill tone="yellow">{unverified} deposit(s) to confirm</Pill>}
          </div>
          <ul className="text-xs space-y-1" style={{ color: "var(--color-text-secondary)" }}>
            <li>{summary.cashOnHandDepositDone ? "✔" : "✘"} Previous cash on hand deposited ({peso(summary.cashOnHandDeposited)} of {peso(summary.requiredCashOnHandDeposit)})</li>
            <li>{summary.salesDepositDone ? "✔" : "✘"} Sales deposited ({peso(summary.salesDeposited)})</li>
            <li>{day?.reportDownloadedAt ? "✔" : "✘"} Report downloaded by cashier{day?.reportDownloadedAt ? ` (${formatDateTime(day.reportDownloadedAt)})` : ""}</li>
            <li>{status === "closed" ? "✔" : "✘"} Day closed{day?.closedAt ? ` (${formatDateTime(day.closedAt)})` : ""}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => printRegisterReport(reportData())} className="px-3 py-2 text-xs font-semibold" style={secondaryButtonStyle}>
              🖨️ Print / Save PDF
            </button>
            <button onClick={handleExcel} disabled={!!busy} className="px-3 py-2 text-xs font-semibold disabled:opacity-50" style={secondaryButtonStyle}>
              📊 Download Excel
            </button>
            {canReopen && (
              <button
                onClick={() => setReopening(true)}
                className="px-3 py-2 text-xs font-semibold"
                style={{ ...secondaryButtonStyle, color: "#facc15" }}
              >
                ↺ Reopen day
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- Deposits ---- */}
      <Section title={`Deposits (${deposits.length})`}>
        {sortedDeposits.length === 0 ? (
          <Empty>No deposits yet.</Empty>
        ) : (
          <div className="space-y-2">
            {sortedDeposits.map((d) => {
              const canVoid = d.voided
                ? false
                : isOwner
                ? status === "open"
                : canCashierAct && !d.verifiedAt;
              return (
                <div
                  key={d.id}
                  className="p-3 flex gap-3"
                  style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)", opacity: d.voided ? 0.55 : 1 }}
                >
                  <button
                    onClick={() => setViewing({ src: d.proofImage, caption: `${DEPOSIT_TYPE_LABELS[d.type]} · ${peso(d.amount)} · ${formatDateTime(d.createdAt)}` })}
                    className="w-16 h-16 shrink-0 rounded-lg overflow-hidden"
                    style={{ background: "var(--color-surface)" }}
                    aria-label="View proof photo"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.proofImage} alt="Deposit proof" className="w-full h-full object-cover" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p
                        className="text-sm font-bold"
                        style={{ color: "var(--color-text-primary)", textDecoration: d.voided ? "line-through" : undefined }}
                      >
                        {peso(d.amount)}
                      </p>
                      <Pill tone={d.type === "cashOnHand" ? "blue" : "green"}>{DEPOSIT_TYPE_LABELS[d.type]}</Pill>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                      {formatDateTime(d.createdAt)} · {d.method}
                      {d.reference ? ` · ${d.reference}` : ""}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: d.voided ? TONES.red.text : d.verifiedAt ? TONES.green.text : TONES.yellow.text }}>
                      {d.voided
                        ? `Voided by ${d.voidedByName || "—"}${d.voidReason ? ` — ${d.voidReason}` : ""}`
                        : d.verifiedAt
                        ? `✓ Received by ${d.verifiedByName || "owner"} · ${formatDateTime(d.verifiedAt)}`
                        : "Waiting for owner to confirm"}
                    </p>
                    {(canVoid || (isOwner && !d.voided && !d.verifiedAt)) && (
                      <div className="flex gap-2 mt-2">
                        {isOwner && !d.voided && !d.verifiedAt && (
                          <button
                            onClick={() => verifyDeposit(d)}
                            disabled={!!busy}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{ background: TONES.green.bg, color: TONES.green.text }}
                          >
                            ✓ Mark received
                          </button>
                        )}
                        {canVoid && (
                          <button
                            onClick={() => setVoiding(d)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: TONES.red.bg, color: TONES.red.text }}
                          >
                            Void
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {isOwner && status === "closed" && deposits.some((d) => !d.voided) && (
          <p className="text-xs mt-2" style={{ color: "var(--color-text-secondary)" }}>
            To void a deposit on a closed day, reopen the day first.
          </p>
        )}
      </Section>

      {/* ---- Expenses ---- */}
      <Section
        title={`Expenses (${expenses.length})`}
        action={canCashierAct ? { label: "+ Add expense", onClick: () => setShowExpense(true) } : undefined}
      >
        {sortedExpenses.length === 0 ? (
          <Empty>No expenses from the drawer.</Empty>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {sortedExpenses.map((e) => (
              <div key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                    {e.description}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {formatTime(e.date)}
                    {e.receiptImage && (
                      <>
                        {" · "}
                        <button
                          onClick={() => setViewing({ src: e.receiptImage!, caption: `${e.description} · ${peso(e.amount)}` })}
                          className="underline"
                          style={{ color: "var(--color-primary-light)" }}
                        >
                          View receipt
                        </button>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-semibold" style={{ color: "#f87171" }}>
                    −{peso(e.amount)}
                  </p>
                  {canCashierAct && (
                    <button
                      onClick={() => removeExpense(e)}
                      className="w-9 h-9 flex items-center justify-center rounded-full text-lg"
                      style={{ color: "#f87171" }}
                      aria-label={`Remove ${e.description}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---- Sales ---- */}
      <Section title={`Sales (${sales.length})`}>
        {sortedSales.length === 0 ? (
          <Empty>No sales yet.</Empty>
        ) : (
          <>
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {visibleSales.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                      {s.itemName} <span style={{ color: "var(--color-text-secondary)" }}>× {s.quantity}</span>
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {formatTime(s.date)}
                      {s.transactionId ? ` · #${s.transactionId.slice(-6)}` : ""}
                      {s.lateSyncFromDate ? ` · late sync from ${s.lateSyncFromDate}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {peso(s.total)}
                    </p>
                    {s.paymentMethod === "ewallet" ? (
                      <Pill tone="blue">GCash{s.paymentRef ? ` ${s.paymentRef}` : ""}</Pill>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        Cash
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {sortedSales.length > SALES_PREVIEW && (
              <button
                onClick={() => setShowAllSales(!showAllSales)}
                className="mt-2 text-sm font-medium"
                style={{ color: "var(--color-primary-light)" }}
              >
                {showAllSales ? "Show fewer" : `Show all ${sortedSales.length} sales`}
              </button>
            )}
          </>
        )}
      </Section>

      {/* ---- Modals ---- */}
      {depositType && (
        <DepositModal
          type={depositType}
          maxAmount={depositType === "cashOnHand" ? summary.cashOnHandDepositRemaining : summary.salesDepositRemaining}
          suggestedAmount={
            depositType === "cashOnHand"
              ? summary.cashOnHandDepositRemaining
              : summary.cashOnHandLimit != null
              ? Math.max(summary.salesDepositShortfall, 0)
              : 0
          }
          explanation={
            depositType === "cashOnHand"
              ? `This is the cash on hand you kept from your previous day (${peso(summary.requiredCashOnHandDeposit)}). It must be deposited in full.`
              : summary.cashOnHandLimit != null
              ? `You have ${peso(summary.salesDepositRemaining)} of today's sales cash left to deposit. Keep at most ${peso(summary.cashOnHandLimit)} as cash on hand.`
              : `You have ${peso(summary.salesDepositRemaining)} of today's sales cash left to deposit. Whatever you don't deposit becomes your cash on hand for tomorrow.`
          }
          onClose={() => setDepositType(null)}
          onSubmit={(input) => submitDeposit(depositType, input)}
        />
      )}
      {showExpense && <ExpenseModal onClose={() => setShowExpense(false)} onSubmit={submitExpense} />}
      {voiding && (
        <ReasonModal
          title={`Void ${peso(voiding.amount)} deposit?`}
          description="The deposit stays in the report, crossed out, and no longer counts. Use this when the amount or photo was wrong, then save the deposit again."
          confirmLabel="Void deposit"
          danger
          onClose={() => setVoiding(null)}
          onConfirm={(reason) => voidDeposit(voiding, reason)}
        />
      )}
      {reopening && (
        <ReasonModal
          title="Reopen this day?"
          description={`${cashier.name} will be able to add deposits and expenses to ${formatBusinessDate(date)} again, and must close it again before selling. Their cash on hand goes back to ${peso(day?.openingCashOnHand ?? 0)} until then.`}
          confirmLabel="Reopen day"
          onClose={() => setReopening(false)}
          onConfirm={reopenDay}
        />
      )}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="w-full max-w-md p-5 sm:p-6 space-y-4" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
            <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Close {formatBusinessDate(date)}?
            </p>
            <div className="text-sm space-y-1" style={{ color: "var(--color-text-secondary)" }}>
              <p>Deposited: {peso(summary.cashOnHandDeposited + summary.salesDeposited)}</p>
              <p>
                You keep <b style={{ color: "var(--color-text-primary)" }}>{peso(summary.closingCashOnHand)}</b> as cash on
                hand for your next day.
              </p>
              <p>
                {date >= today
                  ? "You won't be able to sell again until 12:00 midnight."
                  : "You can start selling for today right after closing."}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClose(false)} className="flex-1 py-2.5 text-sm font-semibold" style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                onClick={closeDay}
                disabled={busy === "close"}
                className="flex-1 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ ...primaryButtonStyle, background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
              >
                {busy === "close" ? "Closing..." : "Close day"}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewing && <PhotoViewer src={viewing.src} caption={viewing.caption} onClose={() => setViewing(null)} />}
    </div>
  );
}

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
      style={{
        background: done ? TONES.green.bg : "var(--color-bg-secondary)",
        color: done ? TONES.green.text : "var(--color-text-secondary)",
      }}
    >
      {done ? "✓" : n}
    </span>
  );
}

function ChecklistStep({
  n,
  done,
  title,
  detail,
  action,
}: {
  n: number;
  done: boolean;
  title: string;
  detail: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <li className="flex gap-3">
      <StepNumber n={n} done={done} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </p>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--color-text-secondary)" }}>
          {detail}
        </p>
        {action && (
          <button onClick={action.onClick} className="mt-2 px-4 py-2 text-xs font-semibold" style={primaryButtonStyle}>
            {action.label}
          </button>
        )}
      </div>
    </li>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="p-4" style={cardStyle}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </p>
        {action && (
          <button onClick={action.onClick} className="px-3 py-1.5 text-xs font-semibold" style={secondaryButtonStyle}>
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm py-3 text-center" style={{ color: "var(--color-text-secondary)" }}>
      {children}
    </p>
  );
}
