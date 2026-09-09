"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getAiAccess, urgencyLevel } from "../lib/subscription";

type Tenant = {
  id: string;
  businessName: string;
  ownerEmail: string;
  subscriptionStatus: string;
  trialStartDate?: string;
  nextPaymentDue?: string;
};

const URGENCY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  overdue: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", label: "Overdue" },
  urgent: { bg: "rgba(249, 115, 22, 0.15)", text: "#fb923c", label: "Due very soon" },
  soon: { bg: "rgba(250, 204, 21, 0.15)", text: "#facc15", label: "Due this week" },
  fine: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80", label: "OK" },
  none: { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", label: "Lifetime" },
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface, #141d33)",
  borderRadius: "var(--radius-card, 1rem)",
  borderWidth: "var(--border-width, 1px)",
  borderColor: "var(--color-border, rgba(59,130,246,0.25))",
};

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const router = useRouter();

  // 🔒 PINAGANDANG AUTH CHECK: Nagtatanong sa Server API sa halip na client-side env variable
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const res = await fetch("/api/check-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.uid }),
        });

        const data = await res.json();

        if (!res.ok || !data.isAdmin) {
          router.push("/dashboard");
          return;
        }

        setAuthorized(true);
      } catch (error) {
        console.error("Admin verification error:", error);
        router.push("/dashboard");
      } finally {
        setChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    const loadTenants = async () => {
      try {
        const snap = await getDocs(collection(db, "tenants"));
        setTenants(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Tenant[]);
      } catch (error) {
        console.error("Failed to load tenants:", error);
      } finally {
        setLoadingTenants(false);
      }
    };
    loadTenants();
  }, [authorized]);

  const sortedTenants = useMemo(() => {
    return [...tenants].sort((a, b) => {
      const infoA = getAiAccess(a);
      const infoB = getAiAccess(b);
      const rank: Record<string, number> = { overdue: 0, urgent: 1, soon: 2, fine: 3, none: 4 };
      return rank[urgencyLevel(infoA)] - rank[urgencyLevel(infoB)];
    });
  }, [tenants]);

  const handleMarkPaidMonthly = async (tenant: Tenant) => {
    setSavingId(tenant.id);
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 30);
    try {
      await updateDoc(doc(db, "tenants", tenant.id), {
        subscriptionStatus: "MONTHLY",
        nextPaymentDue: nextDue.toISOString(),
      });
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenant.id
            ? { ...t, subscriptionStatus: "MONTHLY", nextPaymentDue: nextDue.toISOString() }
            : t
        )
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleActivate60DayPilot = async (tenant: Tenant) => {
    setSavingId(tenant.id);
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 60);
    try {
      await updateDoc(doc(db, "tenants", tenant.id), {
        subscriptionStatus: "MONTHLY",
        nextPaymentDue: nextDue.toISOString(),
      });
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenant.id
            ? { ...t, subscriptionStatus: "MONTHLY", nextPaymentDue: nextDue.toISOString() }
            : t
        )
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleMarkLifetime = async (tenant: Tenant) => {
    setSavingId(tenant.id);
    try {
      await updateDoc(doc(db, "tenants", tenant.id), { subscriptionStatus: "LIFETIME" });
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, subscriptionStatus: "LIFETIME" } : t))
      );
    } finally {
      setSavingId(null);
    }
  };

  if (checking || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0e1a" }}>
        <p className="text-sm" style={{ color: "#8b9bc4" }}>Verifying Admin Access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "#0a0e1a" }}>
      <h1 className="text-xl font-bold mb-1" style={{ color: "#e8edf9" }}>
        Admin — All Shops
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8b9bc4" }}>
        Sorted by most urgent first. Only visible to verified Admin.
      </p>

      {loadingTenants ? (
        <p style={{ color: "#8b9bc4" }}>Loading shops...</p>
      ) : sortedTenants.length === 0 ? (
        <p style={{ color: "#8b9bc4" }}>No shops registered yet.</p>
      ) : (
        <div className="space-y-3">
          {sortedTenants.map((tenant) => {
            const info = getAiAccess(tenant);
            const level = urgencyLevel(info);
            const style = URGENCY_STYLES[level];
            return (
              <div key={tenant.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={cardStyle}>
                <div>
                  <p className="font-semibold" style={{ color: "#e8edf9" }}>
                    {tenant.businessName || "(No name set)"}
                  </p>
                  <p className="text-xs" style={{ color: "#8b9bc4" }}>
                    {tenant.ownerEmail || "no email on file"}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: style.bg, color: style.text }}
                    >
                      {info.status} — {style.label}
                      {info.daysLeft != null && ` (${info.daysLeft}d)`}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleActivate60DayPilot(tenant)}
                    disabled={savingId === tenant.id}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
                    style={{ background: "#06b6d4", color: "#fff" }}
                  >
                    {savingId === tenant.id ? "..." : "🚀 Activate 60-Day Pilot"}
                  </button>
                  <button
                    onClick={() => handleMarkPaidMonthly(tenant)}
                    disabled={savingId === tenant.id}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
                    style={{ background: "#3b82f6", color: "#fff" }}
                  >
                    {savingId === tenant.id ? "..." : "✓ Mark Paid (+30 days)"}
                  </button>
                  <button
                    onClick={() => handleMarkLifetime(tenant)}
                    disabled={savingId === tenant.id}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
                    style={{ background: "#a855f7", color: "#fff" }}
                  >
                    💎 Lifetime
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}