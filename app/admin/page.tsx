"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, doc, updateDoc, query, orderBy } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getAiAccess, urgencyLevel } from "../lib/subscription";

type Tenant = {
  id: string;
  businessName: string;
  ownerEmail: string;
  subscriptionStatus: string;
  trialStartDate?: string;
  nextPaymentDue?: string;
  planId?: "basic" | "pro" | "business" | string;
  manuallyDeactivated?: boolean;
};

const PLAN_OPTIONS: { id: "basic" | "pro" | "business"; label: string; color: string }[] = [
  { id: "basic", label: "Basic", color: "#64748b" },
  { id: "pro", label: "Pro", color: "#3b82f6" },
  { id: "business", label: "Business", color: "#a855f7" },
];

type Feedback = {
  id: string;
  uid: string;
  businessName?: string;
  email?: string;
  category: "feature" | "bug" | "general" | string;
  message: string;
  status: "new" | "resolved" | string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
};

const URGENCY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  overdue: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", label: "Overdue" },
  urgent: { bg: "rgba(249, 115, 22, 0.15)", text: "#fb923c", label: "Due very soon" },
  soon: { bg: "rgba(250, 204, 21, 0.15)", text: "#facc15", label: "Due this week" },
  fine: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80", label: "OK" },
  none: { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", label: "Lifetime" },
};

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  feature: { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", label: "💡 Feature Request" },
  bug: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", label: "🐞 Bug Report" },
  general: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", label: "💬 General" },
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface, #141d33)",
  borderRadius: "var(--radius-card, 1rem)",
  borderWidth: "var(--border-width, 1px)",
  borderColor: "var(--color-border, rgba(59,130,246,0.25))",
};

// --- Live Countdown ---------------------------------------------------
// Nagre-recompute ang natitirang oras every second para "buhay" tumakbo ang
// timer sa screen (para astig tignan), hindi lang static na "(3d)" text.
function useCountdown(targetIso?: string | null) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setRemainingMs(null);
      return;
    }
    const targetTime = new Date(targetIso).getTime();
    const tick = () => setRemainingMs(targetTime - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return remainingMs;
}

function formatCountdown(ms: number) {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  return overdue ? `-${text}` : text;
}

function CountdownBadge({ tenant }: { tenant: Tenant }) {
  const isLifetime = tenant.subscriptionStatus === "LIFETIME";
  const remainingMs = useCountdown(isLifetime ? null : tenant.nextPaymentDue);

  if (tenant.manuallyDeactivated) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sm font-mono font-bold px-3 py-1.5 rounded-lg"
        style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}
      >
        🚫 DEACTIVATED
      </span>
    );
  }

  if (isLifetime) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sm font-mono font-bold px-3 py-1.5 rounded-lg tabular-nums"
        style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}
      >
        ♾️ LIFETIME
      </span>
    );
  }

  if (!tenant.nextPaymentDue || remainingMs === null) {
    return (
      <span className="text-xs" style={{ color: "#8b9bc4" }}>
        Walang due date na naka-set
      </span>
    );
  }

  const overdue = remainingMs < 0;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm font-mono font-bold px-3 py-1.5 rounded-lg tabular-nums"
      style={{
        background: overdue ? "rgba(239,68,68,0.15)" : "rgba(74,222,128,0.15)",
        color: overdue ? "#f87171" : "#4ade80",
      }}
    >
      {overdue ? "⏰ OVERDUE " : "⏳ "}
      {formatCountdown(remainingMs)}
    </span>
  );
}

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<"shops" | "feedback">("shops");
  const router = useRouter();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [feedbackItems, setFeedbackItems] = useState<Feedback[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!authorized) return;
    const loadFeedback = async () => {
      try {
        const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setFeedbackItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Feedback[]);
      } catch (error) {
        console.error("Failed to load feedback:", error);
      } finally {
        setLoadingFeedback(false);
      }
    };
    loadFeedback();
  }, [authorized]);

  const sortedTenants = useMemo(() => {
    return [...tenants].sort((a, b) => {
      const infoA = getAiAccess(a);
      const infoB = getAiAccess(b);
      const rank: Record<string, number> = { overdue: 0, urgent: 1, soon: 2, fine: 3, none: 4 };
      return rank[urgencyLevel(infoA)] - rank[urgencyLevel(infoB)];
    });
  }, [tenants]);

  // Bagong feedback (status: "new") muna, saka na yung resolved na
  const sortedFeedback = useMemo(() => {
    return [...feedbackItems].sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "new" ? -1 : 1;
    });
  }, [feedbackItems]);

  const newFeedbackCount = feedbackItems.filter((f) => f.status !== "resolved").length;

  const handleMarkPaidMonthly = async (tenant: Tenant, planId: "basic" | "pro" | "business") => {
    setSavingId(tenant.id);
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 30);
    try {
      // Ang pagre-renew/pag-mark-paid ay awtomatikong nag-re-reactivate din
      // (in case may naka-deactivate dati) — bagong bayad, bagong access.
      await updateDoc(doc(db, "tenants", tenant.id), {
        subscriptionStatus: "MONTHLY",
        planId,
        nextPaymentDue: nextDue.toISOString(),
        manuallyDeactivated: false,
      });
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenant.id
            ? {
                ...t,
                subscriptionStatus: "MONTHLY",
                planId,
                nextPaymentDue: nextDue.toISOString(),
                manuallyDeactivated: false,
              }
            : t
        )
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleDeactivate = async (tenant: Tenant) => {
    setSavingId(tenant.id);
    const nextValue = !tenant.manuallyDeactivated;
    try {
      await updateDoc(doc(db, "tenants", tenant.id), { manuallyDeactivated: nextValue });
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, manuallyDeactivated: nextValue } : t))
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

  const handleToggleFeedbackStatus = async (item: Feedback) => {
    setSavingFeedbackId(item.id);
    const nextStatus = item.status === "resolved" ? "new" : "resolved";
    try {
      await updateDoc(doc(db, "feedback", item.id), { status: nextStatus });
      setFeedbackItems((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: nextStatus } : f))
      );
    } catch (error) {
      console.error("Failed to update feedback status:", error);
    } finally {
      setSavingFeedbackId(null);
    }
  };

  const formatDate = (ts?: { seconds: number } | null) => {
    if (!ts?.seconds) return "";
    return new Date(ts.seconds * 1000).toLocaleString();
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
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-lg flex-shrink-0"
          style={{ background: "rgba(59,130,246,0.1)", color: "#8b9bc4" }}
          aria-label="Go back"
          title="Back"
        >
          ←
        </button>
        <h1 className="text-xl font-bold" style={{ color: "#e8edf9" }}>
          Admin
        </h1>
      </div>
      <p className="text-sm mb-4 ml-11" style={{ color: "#8b9bc4" }}>
        Only visible to verified Admin.
      </p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("shops")}
          className="px-4 py-2 text-sm font-semibold rounded-lg"
          style={{
            background: activeTab === "shops" ? "#3b82f6" : "rgba(59,130,246,0.1)",
            color: activeTab === "shops" ? "#fff" : "#8b9bc4",
          }}
        >
          🏪 All Shops
        </button>
        <button
          onClick={() => setActiveTab("feedback")}
          className="relative px-4 py-2 text-sm font-semibold rounded-lg"
          style={{
            background: activeTab === "feedback" ? "#3b82f6" : "rgba(59,130,246,0.1)",
            color: activeTab === "feedback" ? "#fff" : "#8b9bc4",
          }}
        >
          📝 Suggestions Inbox
          {newFeedbackCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {newFeedbackCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "shops" && (
        <>
          <p className="text-sm mb-4" style={{ color: "#8b9bc4" }}>
            Sorted by most urgent first.
          </p>
          {loadingTenants ? (
            <p style={{ color: "#8b9bc4" }}>Loading shops...</p>
          ) : sortedTenants.length === 0 ? (
            <p style={{ color: "#8b9bc4" }}>No shops registered yet.</p>
          ) : (
            <div className="space-y-3">
              {sortedTenants.map((tenant) => {
                return (
                  <div key={tenant.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={cardStyle}>
                    <div>
                      <p className="font-semibold" style={{ color: "#e8edf9" }}>
                        {tenant.businessName || "(No name set)"}
                      </p>
                      <p className="text-xs" style={{ color: "#8b9bc4" }}>
                        {tenant.ownerEmail || "no email on file"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#8b9bc4" }}>
                        {tenant.subscriptionStatus || "TRIAL"}
                        {tenant.planId && ` · ${tenant.planId.charAt(0).toUpperCase() + tenant.planId.slice(1)}`}
                      </p>
                      <div className="mt-1.5">
                        <CountdownBadge tenant={tenant} />
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] mr-1" style={{ color: "#5b6d94" }}>
                          Mark Paid:
                        </span>
                        {PLAN_OPTIONS.map((plan) => (
                          <button
                            key={plan.id}
                            onClick={() => handleMarkPaidMonthly(tenant, plan.id)}
                            disabled={savingId === tenant.id}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
                            style={{
                              background: tenant.planId === plan.id && !tenant.manuallyDeactivated ? plan.color : "rgba(255,255,255,0.06)",
                              color: tenant.planId === plan.id && !tenant.manuallyDeactivated ? "#fff" : "#8b9bc4",
                              borderWidth: "1px",
                              borderColor: plan.color,
                            }}
                            title={`Mark as ${plan.label} plan, +1 month`}
                          >
                            {plan.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleMarkLifetime(tenant)}
                          disabled={savingId === tenant.id}
                          className="px-2.5 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50"
                          style={{ background: "rgba(168,85,247,0.12)", color: "#c084fc" }}
                          title="One-time payment — no more monthly renewal needed"
                        >
                          💎 Lifetime
                        </button>
                        <button
                          onClick={() => handleToggleDeactivate(tenant)}
                          disabled={savingId === tenant.id}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
                          style={{
                            background: tenant.manuallyDeactivated ? "rgba(74,222,128,0.15)" : "rgba(239,68,68,0.15)",
                            color: tenant.manuallyDeactivated ? "#4ade80" : "#f87171",
                          }}
                          title={
                            tenant.manuallyDeactivated
                              ? "I-restore ang access nang hindi kailangang i-renew"
                              : "Instant lock — para sa abuse, chargeback, o hindi pagbayad"
                          }
                        >
                          {tenant.manuallyDeactivated ? "✅ Reactivate" : "🚫 Deactivate"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "feedback" && (
        <>
          <p className="text-sm mb-4" style={{ color: "#8b9bc4" }}>
            Mga suggestion/bug report na isinumite ng mga users mula sa Settings &gt; Help &amp; Support.
          </p>
          {loadingFeedback ? (
            <p style={{ color: "#8b9bc4" }}>Loading feedback...</p>
          ) : sortedFeedback.length === 0 ? (
            <p style={{ color: "#8b9bc4" }}>Wala pang naisumiteng feedback.</p>
          ) : (
            <div className="space-y-3">
              {sortedFeedback.map((item) => {
                const catStyle = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.general;
                const isResolved = item.status === "resolved";
                return (
                  <div
                    key={item.id}
                    className="p-4 flex flex-col gap-3"
                    style={{ ...cardStyle, opacity: isResolved ? 0.6 : 1 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: catStyle.bg, color: catStyle.text }}
                          >
                            {catStyle.label}
                          </span>
                          {isResolved && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>
                              ✓ Resolved
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: "#8b9bc4" }}>
                          {item.businessName || "(No shop name)"} · {item.email || "no email"}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: "#5b6d94" }}>
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleFeedbackStatus(item)}
                        disabled={savingFeedbackId === item.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50 flex-shrink-0"
                        style={{ background: isResolved ? "rgba(148,163,184,0.2)" : "#4ade80", color: isResolved ? "#8b9bc4" : "#0a0e1a" }}
                      >
                        {savingFeedbackId === item.id ? "..." : isResolved ? "Reopen" : "Mark Resolved"}
                      </button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "#e8edf9" }}>
                      {item.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}