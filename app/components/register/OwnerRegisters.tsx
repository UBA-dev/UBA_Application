"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  formatBusinessDate,
  formatDateTime,
  money,
  nowIso,
  peso,
  registerGate,
  type RegisterAdjustment,
  type RegisterState,
} from "../../lib/register";
import DayHistory from "./DayHistory";
import DayPanel, { type RegisterViewer } from "./DayPanel";
import { Modal, Notice, Pill, cardStyle, inputStyle, primaryButtonStyle, secondaryButtonStyle } from "./ui";

type CashierRow = { uid: string; name: string; active: boolean; register: RegisterState | null };

export default function OwnerRegisters({
  tenantId,
  viewer,
  businessName,
  logoUrl,
  cashOnHandLimit,
  today,
}: {
  tenantId: string;
  viewer: RegisterViewer;
  businessName: string;
  logoUrl: string | null;
  cashOnHandLimit: number | null;
  today: string;
}) {
  const isOwner = viewer.role === "owner";
  const [registers, setRegisters] = useState<RegisterState[]>([]);
  const [staffCashiers, setStaffCashiers] = useState<{ uid: string; name: string; active: boolean }[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [historyDay, setHistoryDay] = useState<{ id: string; date: string } | null>(null);
  const [adjustmentsFor, setAdjustmentsFor] = useState<{ uid: string; list: RegisterAdjustment[] } | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);

  useEffect(() => {
    return onSnapshot(
      collection(db, "tenants", tenantId, "registers"),
      (snap) => setRegisters(snap.docs.map((d) => ({ ...(d.data() as RegisterState), cashierUid: d.id }))),
      (err) => console.error("registers:", err)
    );
  }, [tenantId]);

  // Only the Owner can read the staff list — it lets them see (and give a
  // starting change fund to) cashiers who haven't sold anything yet.
  useEffect(() => {
    if (!isOwner) return;
    getDocs(query(collection(db, "tenants", tenantId, "staff"), where("role", "==", "cashier")))
      .then((snap) =>
        setStaffCashiers(
          snap.docs.map((d) => ({ uid: `staff_${d.id}`, name: d.data().name || "Cashier", active: d.data().active !== false }))
        )
      )
      .catch((err) => console.error("staff:", err));
  }, [isOwner, tenantId]);

  const cashiers: CashierRow[] = useMemo(() => {
    const byUid = new Map<string, CashierRow>();
    staffCashiers.forEach((s) => byUid.set(s.uid, { ...s, register: null }));
    registers.forEach((r) => {
      const existing = byUid.get(r.cashierUid);
      byUid.set(r.cashierUid, {
        uid: r.cashierUid,
        name: existing?.name || r.cashierName || "Cashier",
        active: existing?.active ?? true,
        register: r,
      });
    });
    return [...byUid.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }, [registers, staffCashiers]);

  const selected = cashiers.find((c) => c.uid === selectedUid) ?? cashiers[0] ?? null;
  const selectedCashierUid = selected?.uid ?? null;

  useEffect(() => {
    if (!selectedCashierUid) return;
    return onSnapshot(
      query(collection(db, "tenants", tenantId, "registerAdjustments"), where("cashierUid", "==", selectedCashierUid)),
      (snap) =>
        setAdjustmentsFor({
          uid: selectedCashierUid,
          list: snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as RegisterAdjustment)
            .sort((a, b) => b.at.localeCompare(a.at)),
        }),
      (err) => console.error("adjustments:", err)
    );
  }, [tenantId, selectedCashierUid]);
  const adjustments = adjustmentsFor?.uid === selectedCashierUid ? adjustmentsFor.list : [];

  if (cashiers.length === 0) {
    return (
      <div className="space-y-4">
        {isOwner && <LimitSettings key={String(cashOnHandLimit)} tenantId={tenantId} cashOnHandLimit={cashOnHandLimit} />}
        <div className="p-8 text-center text-sm" style={{ ...cardStyle, color: "var(--color-text-secondary)" }}>
          {isOwner
            ? "No cashier accounts yet. Add a staff member with the Cashier role in Settings → Staff, and their daily register will show up here."
            : "No cashier activity yet."}
        </div>
      </div>
    );
  }

  const gate = selected ? registerGate(selected.uid, selected.register, today) : null;
  const currentDay = gate ? { id: gate.dayId, date: gate.date } : null;
  const shownDay = historyDay ?? currentDay;

  return (
    <div className="space-y-4">
      {isOwner && <LimitSettings key={String(cashOnHandLimit)} tenantId={tenantId} cashOnHandLimit={cashOnHandLimit} />}

      {/* Cashier picker */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-1 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        {cashiers.map((c) => {
          const g = registerGate(c.uid, c.register, today);
          const isSelected = c.uid === selected?.uid;
          return (
            <button
              key={c.uid}
              onClick={() => {
                setSelectedUid(c.uid);
                setHistoryDay(null);
              }}
              className="shrink-0 text-left px-4 py-3 min-w-44"
              style={{
                ...cardStyle,
                borderColor: isSelected ? "var(--color-primary)" : "var(--color-border)",
                boxShadow: isSelected ? "var(--glow-shadow)" : undefined,
                opacity: c.active ? 1 : 0.6,
              }}
            >
              <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                👤 {c.name}
              </p>
              <div className="mt-1.5">
                <GatePill kind={g.kind} dayExists={g.kind === "ok" && g.dayExists} date={g.date} />
              </div>
              <p className="text-xs mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
                Cash on hand: {peso(c.register?.cashOnHand ?? 0)}
              </p>
              {!c.active && (
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  Deactivated
                </p>
              )}
            </button>
          );
        })}
      </div>

      {selected && gate && shownDay && (
        <>
          {gate.kind === "unclosed" && (
            <Notice tone="red">
              {selected.name} hasn&apos;t closed {formatBusinessDate(gate.date)} yet, so they can&apos;t sell today until
              they deposit and close it.
            </Notice>
          )}

          {isOwner && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-4" style={cardStyle}>
              <div>
                <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {selected.name}&apos;s cash on hand (change fund)
                </p>
                <p className="text-lg font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>
                  {peso(selected.register?.cashOnHand ?? 0)}
                </p>
              </div>
              <button
                onClick={() => setShowAdjust(true)}
                disabled={!!selected.register?.openDayId}
                title={selected.register?.openDayId ? "Can only be changed while their register is closed" : ""}
                className="px-4 py-2 text-xs font-semibold disabled:opacity-40"
                style={secondaryButtonStyle}
              >
                {(selected.register?.cashOnHand ?? 0) > 0 ? "Adjust cash on hand" : "Give starting change fund"}
              </button>
              {selected.register?.openDayId && (
                <p className="w-full text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  Cash on hand can only be changed while {selected.name}&apos;s register is closed.
                </p>
              )}
            </div>
          )}

          {historyDay && (
            <button
              onClick={() => setHistoryDay(null)}
              className="text-sm font-medium"
              style={{ color: "var(--color-primary-light)" }}
            >
              ← Back to current day
            </button>
          )}

          <DayPanel
            key={shownDay.id}
            tenantId={tenantId}
            viewer={viewer}
            cashier={{ uid: selected.uid, name: selected.name }}
            dayId={shownDay.id}
            date={shownDay.date}
            today={today}
            register={selected.register}
            cashOnHandLimit={cashOnHandLimit}
            businessName={businessName}
            logoUrl={logoUrl}
            isActiveDay={false}
          />

          <DayHistory
            key={selected.uid}
            tenantId={tenantId}
            cashierUid={selected.uid}
            selectedDayId={shownDay.id}
            onSelect={(d) => setHistoryDay(d.id === currentDay?.id ? null : { id: d.id, date: d.date })}
          />

          {adjustments.length > 0 && (
            <div className="p-4" style={cardStyle}>
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
                Cash on hand changes by the owner
              </p>
              <div className="space-y-2">
                {adjustments.map((a) => (
                  <div key={a.id} className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    <span style={{ color: "var(--color-text-primary)" }}>
                      {peso(a.from)} → {peso(a.to)}
                    </span>{" "}
                    · {formatDateTime(a.at)} · {a.byName} — “{a.reason}”
                  </div>
                ))}
              </div>
            </div>
          )}

          {showAdjust && (
            <AdjustCashOnHandModal
              cashierName={selected.name}
              current={selected.register?.cashOnHand ?? 0}
              onClose={() => setShowAdjust(false)}
              onSave={async (to, reason) => {
                const at = nowIso();
                const reg = selected.register;
                const batch = writeBatch(db);
                batch.set(
                  doc(db, "tenants", tenantId, "registers", selected.uid),
                  {
                    cashierUid: selected.uid,
                    cashierName: selected.name,
                    cashOnHand: to,
                    cashOnHandSourceDayId: null,
                    openDayId: reg?.openDayId ?? null,
                    openDayDate: reg?.openDayDate ?? null,
                    lastClosedDayId: reg?.lastClosedDayId ?? null,
                    lastClosedDate: reg?.lastClosedDate ?? null,
                    updatedAt: at,
                  },
                  { merge: true }
                );
                batch.set(doc(collection(db, "tenants", tenantId, "registerAdjustments")), {
                  cashierUid: selected.uid,
                  cashierName: selected.name,
                  from: money(reg?.cashOnHand ?? 0),
                  to,
                  reason,
                  at,
                  byName: viewer.name,
                });
                await batch.commit();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function GatePill({ kind, dayExists, date }: { kind: string; dayExists: boolean; date: string }) {
  if (kind === "unclosed") return <Pill tone="red">⚠ Not closed: {formatBusinessDate(date)}</Pill>;
  if (kind === "closedToday") return <Pill tone="green">Closed today</Pill>;
  if (dayExists) return <Pill tone="yellow">Selling today</Pill>;
  return <Pill tone="gray">No sales yet today</Pill>;
}

function LimitSettings({ tenantId, cashOnHandLimit }: { tenantId: string; cashOnHandLimit: number | null }) {
  // Rendered with key={limit}, so a saved limit refreshes the field.
  const [draft, setDraft] = useState(cashOnHandLimit != null ? String(cashOnHandLimit) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const value = draft.trim() === "" ? null : Math.max(0, money(Number(draft)));
      await updateDoc(doc(db, "tenants", tenantId), { "registerSettings.cashOnHandLimit": value });
      setSaved(true);
    } catch (err) {
      console.error(err);
      alert("Couldn't save the limit. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-2" style={cardStyle}>
      <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
        ⚙️ Cash on hand limit
      </p>
      <p className="text-xs leading-snug" style={{ color: "var(--color-text-secondary)" }}>
        The most a cashier may keep as change fund after closing. They must deposit enough of their sales to stay
        within it. Leave blank for no limit (they still have to deposit their previous cash on hand every day).
      </p>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          placeholder="No limit"
          className="flex-1 min-w-0 px-3 py-2"
          style={inputStyle}
        />
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={primaryButtonStyle}>
          {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

function AdjustCashOnHandModal({
  cashierName,
  current,
  onClose,
  onSave,
}: {
  cashierName: string;
  current: number;
  onClose: () => void;
  onSave: (to: number, reason: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(current || ""));
  const [reason, setReason] = useState(current > 0 ? "" : "Starting change fund");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = money(Number(amount));
    if (!(to >= 0) || amount.trim() === "") return setError("Enter the amount the cashier is holding.");
    if (!reason.trim()) return setError("Give a short reason — it's kept in the log.");
    setSaving(true);
    setError("");
    try {
      await onSave(to, reason.trim());
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${cashierName}'s cash on hand`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm leading-snug" style={{ color: "var(--color-text-secondary)" }}>
          Use this when you hand the cashier a starting change fund, or to correct their cash on hand. Their next day
          opens with this amount, and they&apos;ll have to deposit it back in full when they close that day. Every change is
          logged.
        </p>
        <div>
          <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Cash on hand (₱)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full mt-1 px-3 py-2"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Reason
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full mt-1 px-3 py-2"
            style={inputStyle}
            maxLength={160}
          />
        </div>
        {error && <Notice tone="red">{error}</Notice>}
        <button type="submit" disabled={saving} className="w-full py-3 text-sm font-semibold disabled:opacity-50" style={primaryButtonStyle}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </Modal>
  );
}
