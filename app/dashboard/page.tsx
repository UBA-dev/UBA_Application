"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import Sidebar from "../components/Sidebar";
import { buildTrendSeries, computePeriodComparison, RANGE_OPTIONS, RANGE_LABELS } from "../lib/analytics";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useTheme } from "../context/ThemeContext";

type Tenant = {
  businessName: string;
  businessType: string;
  theme: string;
  subscriptionStatus: string;
  aiAnalyticsEnabled?: boolean;
  lastInsight?: AIInsight;
  lastInsightAt?: string;
  lastInsightRange?: string;
};
type SaleRecord = { id: string; itemName: string; total: number; profit: number; quantity: number; date: string };
type ExpenseRecord = { id: string; amount: number; date: string };
type InventoryItemLite = {
  id: string;
  name: string;
  category: string;
  stock: number;
  threshold: number;
  unitCost: number;
  sellingPrice: number;
};
type RepairTicketLite = {
  id: string;
  deviceInfo: string;
  issueDescription: string;
  status: string;
  laborPayment: number;
  createdAt: string;
  updatedAt: string;
};

type AITaskPriority = "high" | "medium" | "low";

type AITask = {
  id: string;
  text: string;
  priority: AITaskPriority;
  completed: boolean;
  createdAt: string;
};

type AIInsight = {
  summary: string;
  tasks: { text: string; priority: AITaskPriority }[];
  suggestedGoal: { label: string; value: string };
};

const PRIORITY_ORDER: Record<AITaskPriority, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_COLORS: Record<AITaskPriority, { bg: string; text: string }> = {
  high: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
  medium: { bg: "rgba(250, 204, 21, 0.15)", text: "#facc15" },
  low: { bg: "rgba(96, 165, 250, 0.15)", text: "#60a5fa" },
};

function TrendArrow({ pct }: { pct: number }) {
  const isUp = pct >= 0;
  return (
    <span
      className="text-xs font-semibold inline-flex items-center gap-1"
      style={{ color: isUp ? "#4ade80" : "#f87171" }}
    >
      {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function DashboardPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [items, setItems] = useState<InventoryItemLite[]>([]);
  const [repairTickets, setRepairTickets] = useState<RepairTicketLite[]>([]);
  const [range, setRange] = useState<string>("30D");
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [insightError, setInsightError] = useState("");
  const [aiTasks, setAiTasks] = useState<AITask[]>([]);
  const aiTasksRef = useRef<AITask[]>([]);
  const router = useRouter();
  const { graphStyle } = useTheme();

    useEffect(() => {
    let unsubSales = () => {};
    let unsubExpenses = () => {};
    let unsubInv = () => {};
    let unsubTickets = () => {};
    let unsubTasks = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      unsubSales();
      unsubExpenses();
      unsubInv();
      unsubTickets();
      unsubTasks();

      if (!user) {
        router.push("/login");
        return;
      }
      const tenantDoc = await getDoc(doc(db, "tenants", user.uid));
      if (tenantDoc.exists()) {
        setTenant(tenantDoc.data() as Tenant);
      } else {
        router.push("/onboarding");
        return;
      }
      setUid(user.uid);
      setLoading(false);

      const salesQuery = query(collection(db, "tenants", user.uid, "sales"), orderBy("date", "desc"));
      unsubSales = onSnapshot(salesQuery, (snapshot) => {
        setSales(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as SaleRecord[]);
      });

      const expenseQuery = query(collection(db, "tenants", user.uid, "expenses"), orderBy("date", "desc"));
      unsubExpenses = onSnapshot(expenseQuery, (snapshot) => {
        setExpenses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseRecord[]);
      });

      const invQuery = query(collection(db, "tenants", user.uid, "inventory"), orderBy("name"));
      unsubInv = onSnapshot(invQuery, (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as InventoryItemLite[]);
      });

      const ticketQuery = query(
        collection(db, "tenants", user.uid, "repairTickets"),
        orderBy("createdAt", "desc")
      );
      unsubTickets = onSnapshot(ticketQuery, (snapshot) => {
        setRepairTickets(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as RepairTicketLite[]);
      });

      const taskQuery = query(collection(db, "tenants", user.uid, "aiTasks"), orderBy("createdAt", "desc"));
      unsubTasks = onSnapshot(taskQuery, (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as AITask[];
        setAiTasks(list);
        aiTasksRef.current = list;
      });
    });

    return () => {
      unsubscribeAuth();
      unsubSales();
      unsubExpenses();
      unsubInv();
      unsubTickets();
      unsubTasks();
    };
  }, [router]);

  const { series, start, end } = useMemo(() => buildTrendSeries(sales, expenses, range), [sales, expenses, range]);
  const comparison = useMemo(() => computePeriodComparison(sales, expenses, range), [sales, expenses, range]);

  const salesInRange = useMemo(
    () => sales.filter((s) => { const d = new Date(s.date); return d >= start && d <= end; }),
    [sales, start, end]
  );

  const ticketsInRange = useMemo(
    () => repairTickets.filter((t) => { const d = new Date(t.createdAt); return d >= start && d <= end; }),
    [repairTickets, start, end]
  );

  // Top-selling items — aggregated by name, sorted by revenue
  const topSellingItems = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; profit: number; quantity: number }>();
    salesInRange.forEach((s) => {
      const existing = map.get(s.itemName) || { name: s.itemName, revenue: 0, profit: 0, quantity: 0 };
      existing.revenue += s.total || 0;
      existing.profit += s.profit || 0;
      existing.quantity += s.quantity || 0;
      map.set(s.itemName, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 3);
  }, [salesInRange]);

  const slowMovingItems = useMemo(() => {
    const soldNames = new Set(salesInRange.map((s) => s.itemName));
    return items
      .filter((i) => i.stock > 0 && !soldNames.has(i.name))
      .slice(0, 5)
      .map((i) => ({ name: i.name, stock: i.stock }));
  }, [items, salesInRange]);

  const lowStockItems = useMemo(() => {
    return items
      .filter((i) => i.stock <= i.threshold)
      .slice(0, 5)
      .map((i) => ({ name: i.name, stock: i.stock, threshold: i.threshold }));
  }, [items]);

  const categoryBreakdown = useMemo(() => {
    const nameToCategory = new Map(items.map((i) => [i.name, i.category]));
    const map = new Map<string, number>();
    salesInRange.forEach((s) => {
      const category = nameToCategory.get(s.itemName) || "Uncategorized";
      map.set(category, (map.get(category) || 0) + (s.total || 0));
    });
    return Array.from(map.entries())
      .map(([category, revenue]) => ({ category, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
  }, [salesInRange, items]);

  // Repair ticket metrics — labor revenue, overdue tickets, common devices
  const repairMetrics = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    ticketsInRange.forEach((t) => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });

    const laborRevenue = ticketsInRange
      .filter((t) => t.status === "Claimed")
      .reduce((sum, t) => sum + (t.laborPayment || 0), 0);

    const now = new Date();
    const overdue = repairTickets.filter((t) => {
      if (t.status !== "Pending" && t.status !== "In Progress") return false;
      const ageMs = now.getTime() - new Date(t.createdAt).getTime();
      return ageMs > 5 * 24 * 60 * 60 * 1000; // older than 5 days and still unresolved
    });

    const deviceFreq = new Map<string, number>();
    ticketsInRange.forEach((t) => {
      if (t.deviceInfo) deviceFreq.set(t.deviceInfo, (deviceFreq.get(t.deviceInfo) || 0) + 1);
    });
    const topDevices = Array.from(deviceFreq.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      totalTickets: ticketsInRange.length,
      statusCounts,
      laborRevenue,
      overdueCount: overdue.length,
      overdueExamples: overdue.slice(0, 3).map((t) => ({
        device: t.deviceInfo,
        daysOpen: Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      })),
      topDevices,
    };
  }, [ticketsInRange, repairTickets]);

    // Items with a thin profit margin — a real analyst would flag these for a price review
  const marginAnalysis = useMemo(() => {
    return items
      .filter((i) => i.sellingPrice > 0 && i.unitCost > 0)
      .map((i) => ({
        name: i.name,
        marginPct: Math.round(((i.sellingPrice - i.unitCost) / i.sellingPrice) * 100),
      }))
      .filter((i) => i.marginPct < 15)
      .sort((a, b) => a.marginPct - b.marginPct)
      .slice(0, 5);
  }, [items]);

  // Repair issues reported more than once — a signal to pre-stock the relevant parts
  const commonIssues = useMemo(() => {
    const map = new Map<string, number>();
    ticketsInRange.forEach((t) => {
      const key = (t.issueDescription || "").trim().toLowerCase();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .filter(([, count]) => count > 1)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [ticketsInRange]);

  const hasEnoughData = sales.length > 0 || expenses.length > 0 || repairTickets.length > 0;

    // Load the cached insight (if any) when the tenant doc arrives — no API call here
  useEffect(() => {
    if (tenant?.lastInsight) {
      setInsight(tenant.lastInsight);
    }
  }, [tenant]);

  const runAnalysis = async () => {
    if (!uid) return;
    setLoadingInsight(true);
    setInsightError("");
    try {
        const res = await fetch("/api/analyze-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rangeLabel: (RANGE_LABELS as Record<string, string>)[range],
          comparison,
          topSellingItems,
          slowMovingItems,
          lowStockItems,
          categoryBreakdown,
          repairMetrics,
          currentMonth: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          marginAnalysis,
          commonIssues,
          periodSeries: series,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInsightError(data.error || "Couldn't generate an insight right now.");
        return;
      }
      setInsight(data);

      // Cache the result on the tenant doc so we don't need to re-call the API
      // just to display the same insight again later.
      await updateDoc(doc(db, "tenants", uid), {
        lastInsight: data,
        lastInsightAt: new Date().toISOString(),
        lastInsightRange: range,
      });

      // Persist new tasks — skip ones that already exist (by text match)
      if (Array.isArray(data.tasks)) {
        const existingTexts = new Set(aiTasksRef.current.map((t) => t.text.trim().toLowerCase()));
        for (const t of data.tasks) {
          const norm = (t.text || "").trim().toLowerCase();
          if (!norm || existingTexts.has(norm)) continue;
          await addDoc(collection(db, "tenants", uid, "aiTasks"), {
            text: t.text,
            priority: t.priority || "medium",
            completed: false,
            createdAt: new Date().toISOString(),
          });
          existingTexts.add(norm);
        }
      }
    } catch (err) {
      console.error(err);
      setInsightError("Couldn't generate an insight right now.");
    } finally {
      setLoadingInsight(false);
    }
  };

  const handleToggleAiAnalytics = async () => {
    if (!uid || !tenant) return;
    const newValue = !tenant.aiAnalyticsEnabled;
    await updateDoc(doc(db, "tenants", uid), { aiAnalyticsEnabled: newValue });
    setTenant({ ...tenant, aiAnalyticsEnabled: newValue });
  };

  const handleToggleTask = async (task: AITask) => {
    if (!uid) return;
    await updateDoc(doc(db, "tenants", uid, "aiTasks", task.id), { completed: !task.completed });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!uid) return;
    await deleteDoc(doc(db, "tenants", uid, "aiTasks", taskId));
  };

  const activeTasks = useMemo(() => {
    return aiTasks
      .filter((t) => !t.completed)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [aiTasks]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (loading || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg-primary)" }}>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Loading your dashboard...
        </p>
      </div>
    );
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--color-surface)",
    borderRadius: "var(--radius-card)",
    borderWidth: "var(--border-width)",
    borderColor: "var(--color-border)",
  };

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <div className="flex-1">
        <header
          className="px-6 py-4 border-b"
          style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-border)" }}
        >
          <h1 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
            Welcome back, {tenant.businessName}!
          </h1>
          <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            Trial Status: {tenant.subscriptionStatus}
          </p>
        </header>

        <main className="p-6">
          {!hasEnoughData ? (
            <div className="p-8 text-center" style={{ ...cardStyle, color: "var(--color-text-secondary)" }}>
              No sales, expense, or repair data yet. Once you start recording activity, your analytics will show up here.
            </div>
          ) : (
            <>
              {/* Range selector */}
              <div className="flex flex-wrap gap-2 mb-6">
                {RANGE_OPTIONS.map((r) => {
                  const isActive = range === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className="px-4 py-1.5 rounded-full text-sm font-medium transition"
                      style={{
                        background: isActive ? "var(--color-primary)" : "var(--color-surface)",
                        color: isActive ? "#fff" : "var(--color-text-secondary)",
                        boxShadow: isActive ? "var(--glow-shadow)" : "none",
                        borderWidth: isActive ? 0 : "var(--border-width)",
                        borderColor: "var(--color-border)",
                      }}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>

              {/* Summary cards with trend arrows */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="p-4" style={cardStyle}>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Revenue</p>
                  <p className="text-lg font-bold mt-1" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>
                    ₱{comparison.currentRevenue.toLocaleString()}
                  </p>
                  <TrendArrow pct={comparison.revenueChangePct} />
                </div>
                <div className="p-4" style={cardStyle}>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Profit</p>
                  <p className="text-lg font-bold mt-1" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>
                    ₱{comparison.currentProfit.toLocaleString()}
                  </p>
                  <TrendArrow pct={comparison.profitChangePct} />
                </div>
                <div className="p-4" style={cardStyle}>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Expenses</p>
                  <p className="text-lg font-bold mt-1" style={{ color: "#f87171", fontFamily: "var(--font-heading)" }}>
                    ₱{comparison.currentExpenses.toLocaleString()}
                  </p>
                  <TrendArrow pct={-comparison.expensesChangePct} />
                </div>
                <div className="p-4" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Net Profit</p>
                  <p
                    className="text-lg font-bold mt-1"
                    style={{
                      color: comparison.currentNetProfit >= 0 ? "#4ade80" : "#f87171",
                      fontFamily: "var(--font-heading)",
                    }}
                  >
                    ₱{comparison.currentNetProfit.toLocaleString()}
                  </p>
                  <TrendArrow pct={comparison.netProfitChangePct} />
                </div>
              </div>

              {/* Trend chart */}
              <div className="p-4 mb-6" style={cardStyle}>
                <p className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
                  {(RANGE_LABELS as Record<string, string>)[range]}
                </p>
                <ResponsiveContainer width="100%" height={280}>
  {graphStyle === "bar" ? (
    <BarChart data={series}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
      <XAxis dataKey="label" stroke="var(--color-text-secondary)" fontSize={11} />
      <YAxis stroke="var(--color-text-secondary)" fontSize={11} />
      <Tooltip
        contentStyle={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          color: "var(--color-text-primary)",
        }}
        formatter={(value: any) => `₱${Number(value).toLocaleString()}`}
      />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      <Bar dataKey="revenue" name="Revenue" fill="var(--color-primary-light)" radius={[4, 4, 0, 0]} />
      <Bar dataKey="netProfit" name="Net Profit" fill="#4ade80" radius={[4, 4, 0, 0]} />
      <Bar dataKey="expenses" name="Expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
    </BarChart>
  ) : graphStyle === "area" ? (
    <AreaChart data={series}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
      <XAxis dataKey="label" stroke="var(--color-text-secondary)" fontSize={11} />
      <YAxis stroke="var(--color-text-secondary)" fontSize={11} />
      <Tooltip
        contentStyle={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          color: "var(--color-text-primary)",
        }}
        formatter={(value: any) => `₱${Number(value).toLocaleString()}`}
      />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--color-primary-light)" fill="var(--color-primary-light)" fillOpacity={0.25} strokeWidth={2} />
      <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#4ade80" fill="#4ade80" fillOpacity={0.2} strokeWidth={2} />
      <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f87171" fill="#f87171" fillOpacity={0.2} strokeWidth={2} />
    </AreaChart>
  ) : (
    <LineChart data={series}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
      <XAxis dataKey="label" stroke="var(--color-text-secondary)" fontSize={11} />
      <YAxis stroke="var(--color-text-secondary)" fontSize={11} />
      <Tooltip
        contentStyle={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          color: "var(--color-text-primary)",
        }}
        formatter={(value: any) => `₱${Number(value).toLocaleString()}`}
      />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      <Line type="monotone" dataKey="revenue" name="Revenue" stroke="var(--color-primary-light)" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#4ade80" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f87171" strokeWidth={2} dot={false} />
    </LineChart>
  )}
</ResponsiveContainer>
              </div>

                            {/* AI Business Analyst — toggleable, manual-trigger, cached */}
              <div className="p-5 mb-6" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-semibold" style={{ color: "var(--color-primary-light)" }}>
                    🤖 Your AI Business Analyst
                  </p>
                  <button
                    onClick={handleToggleAiAnalytics}
                    className="text-xs font-medium px-3 py-1 rounded-full transition"
                    style={{
                      background: tenant.aiAnalyticsEnabled ? "rgba(34, 197, 94, 0.15)" : "var(--color-bg-secondary)",
                      color: tenant.aiAnalyticsEnabled ? "#4ade80" : "var(--color-text-secondary)",
                    }}
                  >
                    {tenant.aiAnalyticsEnabled ? "● Enabled" : "○ Disabled"}
                  </button>
                </div>

                {!tenant.aiAnalyticsEnabled ? (
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    AI Analytics is off. Turn it on above to get insights and priority tasks — you control when it runs, so it won't use extra AI usage automatically.
                  </p>
                ) : (
                  <>
                    <button
                      onClick={runAnalysis}
                      disabled={loadingInsight}
                      className="w-full font-semibold py-2 mb-4 text-sm disabled:opacity-50 hover:opacity-90"
                      style={{
                        background: "var(--gradient-accent)",
                        color: "#fff",
                        borderRadius: "var(--radius-button)",
                      }}
                    >
                      {loadingInsight
                        ? "Analyzing..."
                        : insight
                        ? "🔄 Re-analyze My Business"
                        : "🔍 Analyze My Business"}
                    </button>

                    {tenant.lastInsightAt && (
                      <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
                        Last analyzed: {new Date(tenant.lastInsightAt).toLocaleString()}
                        {tenant.lastInsightRange && ` · ${(RANGE_LABELS as Record<string, string>)[tenant.lastInsightRange] || tenant.lastInsightRange}`}
                      </p>
                    )}
                  </>
                )}

                {tenant.aiAnalyticsEnabled && loadingInsight ? (
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    Analyzing your shop's data...
                  </p>
                ) : insightError ? (
                  <p className="text-sm" style={{ color: "#f87171" }}>{insightError}</p>
                ) : insight ? (
                  <>
                    <p className="text-sm font-medium mb-4" style={{ color: "var(--color-text-primary)" }}>
                      {insight.summary}
                    </p>

                    {insight.suggestedGoal && (
                      <div
                        className="flex justify-between items-center px-4 py-3 mb-4"
                        style={{ background: "var(--gradient-accent)", borderRadius: "var(--radius-button)" }}
                      >
                        <span className="text-xs font-medium" style={{ color: "#fff" }}>
                          🎯 {insight.suggestedGoal.label}
                        </span>
                        <span className="text-base font-bold" style={{ color: "#fff", fontFamily: "var(--font-heading)" }}>
                          {insight.suggestedGoal.value}
                        </span>
                      </div>
                    )}
                  </>
                ) : null}

                {/* Persistent, checkable task list — shown regardless of toggle, since these are already saved */}
                {tenant.aiAnalyticsEnabled && activeTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      Action items
                    </p>
                    {activeTasks.map((task) => {
                      const colors = PRIORITY_COLORS[task.priority];
                      return (
                        <div
                          key={task.id}
                          className="flex items-start gap-2 px-3 py-2 text-sm"
                          style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)" }}
                        >
                          <button
                            onClick={() => handleToggleTask(task)}
                            className="mt-0.5 w-4 h-4 rounded flex-shrink-0"
                            style={{ borderWidth: "1.5px", borderColor: colors.text }}
                            title="Mark as done"
                          />
                          <span className="flex-1" style={{ color: "var(--color-text-primary)" }}>
                            {task.text}
                          </span>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: colors.bg, color: colors.text }}
                          >
                            {task.priority}
                          </span>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-xs leading-none hover:opacity-70 flex-shrink-0"
                            style={{ color: "var(--color-text-secondary)" }}
                            title="Dismiss"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Link
                href="/sales"
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--color-primary-light)" }}
              >
                View detailed Sales & Expenses report →
              </Link>
            </>
          )}
        </main>
      </div>
    </div>
  );
}