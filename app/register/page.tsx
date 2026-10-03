"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";
import { canAccessPage, homeFor } from "../lib/permissions";
import { getQueuedActions } from "../lib/offlineQueue";
import {
  businessDate,
  formatBusinessDate,
  peso,
  registerGate,
  syncServerClock,
  type RegisterState,
} from "../lib/register";
import Sidebar from "../components/Sidebar";
import DayPanel, { type RegisterViewer } from "../components/register/DayPanel";
import DayHistory from "../components/register/DayHistory";
import OwnerRegisters from "../components/register/OwnerRegisters";
import { Notice } from "../components/register/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<RegisterViewer | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [cashOnHandLimit, setCashOnHandLimit] = useState<number | null>(null);
  const [today, setToday] = useState(() => businessDate());
  const [register, setRegister] = useState<RegisterState | null>(null);
  const [registerLoaded, setRegisterLoaded] = useState(false);
  const [historyDay, setHistoryDay] = useState<{ id: string; date: string } | null>(null);
  const [offlineSaleDays, setOfflineSaleDays] = useState<string[]>([]);

  // Business date by the server's clock; re-checked so midnight rolls over
  // even if the page stays open.
  useEffect(() => {
    syncServerClock().then(() => setToday(businessDate()));
    const timer = setInterval(() => setToday(businessDate()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let unsubTenant = () => {};
    let unsubRegister = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      unsubTenant();
      unsubRegister();
      if (!user) {
        router.push("/login");
        return;
      }
      const session = await getSessionInfo(user);
      if (!canAccessPage(session.role, "/register")) {
        router.push(homeFor(session.role));
        return;
      }
      setTenantId(session.tenantId);
      setViewer({ uid: user.uid, name: session.staffName || user.displayName || "Owner", role: session.role });

      unsubTenant = onSnapshot(doc(db, "tenants", session.tenantId), (snap) => {
        const data = snap.data() || {};
        setBusinessName(data.businessName || "");
        setLogoUrl(data.logoUrl || null);
        const limit = data.registerSettings?.cashOnHandLimit;
        setCashOnHandLimit(typeof limit === "number" ? limit : null);
      });

      if (session.role === "cashier") {
        unsubRegister = onSnapshot(
          doc(db, "tenants", session.tenantId, "registers", user.uid),
          (snap) => {
            setRegister(snap.exists() ? ({ ...(snap.data() as RegisterState), cashierUid: snap.id }) : null);
            setRegisterLoaded(true);
          },
          (err) => {
            console.error("register:", err);
            setRegisterLoaded(true);
          }
        );
      }
    });

    return () => {
      unsubscribeAuth();
      unsubTenant();
      unsubRegister();
    };
  }, [router]);

  // POS sales saved offline on this phone — a day can't close until they sync.
  useEffect(() => {
    const load = () =>
      getQueuedActions()
        .then((actions) =>
          setOfflineSaleDays(actions.filter((a) => a.type === "pos_sale").map((a) => a.payload?.register?.dayId || ""))
        )
        .catch(() => {});
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);

  const isCashier = viewer?.role === "cashier";

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 pb-24 sm:p-6 max-w-5xl">
        <div className="mb-5">
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>
            Daily Register
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {isCashier
              ? "Your sales, expenses, deposits and cash on hand for the day"
              : "Each cashier's daily sales, expenses, deposits and cash on hand"}
          </p>
        </div>

        {!tenantId || !viewer || (isCashier && !registerLoaded) ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--color-text-secondary)" }}>
            Loading...
          </p>
        ) : isCashier ? (
          (() => {
            const gate = registerGate(viewer.uid, register, today);
            const shown = historyDay ?? { id: gate.dayId, date: gate.date };
            return (
              <div className="space-y-4">
                {gate.kind === "unclosed" && !historyDay && (
                  <Notice tone="red">
                    You haven&apos;t closed <b>{formatBusinessDate(gate.date)}</b> yet. Finish the steps below — you can
                    start selling today right after.
                  </Notice>
                )}
                {gate.kind === "closedToday" && !historyDay && (
                  <Notice tone="green">
                    Today&apos;s register is closed ✓. You can sell again after 12:00 midnight. Keep{" "}
                    <b>{peso(register?.cashOnHand ?? 0)}</b> as your cash on hand (change fund).
                  </Notice>
                )}
                {gate.kind === "ok" && !gate.dayExists && (register?.cashOnHand ?? 0) > 0 && (
                  <Notice tone="blue">
                    You start today with <b>{peso(register!.cashOnHand)}</b> cash on hand for change. Deposit it in full
                    when you close the day.
                  </Notice>
                )}
                {historyDay && (
                  <button
                    onClick={() => setHistoryDay(null)}
                    className="text-sm font-medium"
                    style={{ color: "var(--color-primary-light)" }}
                  >
                    ← Back to {gate.kind === "unclosed" ? "the day to close" : "today"}
                  </button>
                )}

                <DayPanel
                  key={shown.id}
                  tenantId={tenantId}
                  viewer={viewer}
                  cashier={{ uid: viewer.uid, name: viewer.name }}
                  dayId={shown.id}
                  date={shown.date}
                  today={today}
                  register={register}
                  cashOnHandLimit={cashOnHandLimit}
                  businessName={businessName}
                  logoUrl={logoUrl}
                  isActiveDay={!historyDay && gate.kind !== "closedToday"}
                  pendingOfflineSales={offlineSaleDays.filter((id) => id === shown.id).length}
                />

                <DayHistory
                  tenantId={tenantId}
                  cashierUid={viewer.uid}
                  selectedDayId={shown.id}
                  onSelect={(d) => setHistoryDay(d.id === gate.dayId ? null : { id: d.id, date: d.date })}
                />
              </div>
            );
          })()
        ) : (
          <OwnerRegisters
            tenantId={tenantId}
            viewer={viewer}
            businessName={businessName}
            logoUrl={logoUrl}
            cashOnHandLimit={cashOnHandLimit}
            today={today}
          />
        )}
      </main>
    </div>
  );
}
