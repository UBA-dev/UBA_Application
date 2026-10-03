"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { formatBusinessDate, peso, type RegisterDay } from "../../lib/register";
import { Pill, cardStyle } from "./ui";

const PAGE = 14;

// Past register days for one cashier, newest first. Tapping a day opens its
// full detail and report. Give it key={cashierUid} so switching cashiers starts
// the list fresh.
export default function DayHistory({
  tenantId,
  cashierUid,
  selectedDayId,
  onSelect,
}: {
  tenantId: string;
  cashierUid: string;
  selectedDayId: string;
  onSelect: (day: RegisterDay) => void;
}) {
  const [days, setDays] = useState<RegisterDay[]>([]);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    // No orderBy: equality-only queries need no composite index. Sorted below.
    const q = query(collection(db, "tenants", tenantId, "registerDays"), where("cashierUid", "==", cashierUid));
    return onSnapshot(
      q,
      (snap) =>
        setDays(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as RegisterDay)
            .sort((a, b) => b.date.localeCompare(a.date))
        ),
      (err) => console.error("register history:", err)
    );
  }, [tenantId, cashierUid]);

  if (days.length === 0) return null;

  return (
    <div className="p-4" style={cardStyle}>
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
        🗓️ Register history
      </p>
      <div className="space-y-2">
        {days.slice(0, shown).map((d) => {
          const c = d.closing;
          const selected = d.id === selectedDayId;
          return (
            <button
              key={d.id}
              onClick={() => onSelect(d)}
              className="w-full text-left p-3 flex items-center justify-between gap-3"
              style={{
                background: selected ? "var(--color-bg-secondary)" : "transparent",
                borderRadius: "var(--radius-button)",
                borderWidth: "var(--border-width)",
                borderColor: selected ? "var(--color-primary)" : "var(--color-border)",
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {formatBusinessDate(d.date)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  {c
                    ? `Sales ${peso(c.totalSales)} · Deposited ${peso(c.cashOnHandDeposited + c.salesDeposited)} · Kept ${peso(c.closingCashOnHand)}`
                    : `Opened with ${peso(d.openingCashOnHand)} cash on hand`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {d.status === "closed" ? <Pill tone="green">Closed</Pill> : <Pill tone="yellow">Open</Pill>}
                {(d.reopenCount || 0) > 0 && <Pill tone="gray">Reopened</Pill>}
              </div>
            </button>
          );
        })}
      </div>
      {days.length > shown && (
        <button
          onClick={() => setShown(shown + PAGE)}
          className="mt-3 text-sm font-medium"
          style={{ color: "var(--color-primary-light)" }}
        >
          Show older days
        </button>
      )}
    </div>
  );
}
