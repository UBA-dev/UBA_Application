"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import Sidebar from "../components/Sidebar";

type SaleRecord = {
  id: string;
  itemName: string;
  quantity: number;
  price: number;
  total: number;
  profit: number;
  date: string;
};

type ExpenseRecord = {
  id: string;
  description: string;
  amount: number;
  date: string;
};

type Period = "Day" | "Week" | "Month" | "Year";

function getRange(period: Period, refDate: Date): { start: Date; end: Date } {
  const start = new Date(refDate);
  const end = new Date(refDate);

  if (period === "Day") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === "Week") {
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === "Month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

function formatPeriodLabel(period: Period, refDate: Date): string {
  if (period === "Day") {
    return refDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  if (period === "Week") {
    const { start, end } = getRange(period, refDate);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" }
    )}`;
  }
  if (period === "Month") {
    return refDate.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  }
  return String(refDate.getFullYear());
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  borderColor: "var(--color-border)",
  borderRadius: "var(--radius-button)",
  borderWidth: "var(--border-width)",
};

const labelStyle: React.CSSProperties = {
  color: "var(--color-text-secondary)",
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  borderRadius: "var(--radius-card)",
  borderWidth: "var(--border-width)",
  borderColor: "var(--color-border)",
};

export default function SalesExpensesPage() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const router = useRouter();

  const [period, setPeriod] = useState<Period>("Day");
  const [refDate, setRefDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expDescription, setExpDescription] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expDate, setExpDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [savingExpense, setSavingExpense] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);

      const salesQuery = query(
        collection(db, "tenants", user.uid, "sales"),
        orderBy("date", "desc")
      );
      const unsubSales = onSnapshot(salesQuery, (snapshot) => {
        setSales(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as SaleRecord[]
        );
      });

      const expenseQuery = query(
        collection(db, "tenants", user.uid, "expenses"),
        orderBy("date", "desc")
      );
      const unsubExpenses = onSnapshot(expenseQuery, (snapshot) => {
        setExpenses(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseRecord[]
        );
      });

      return () => {
        unsubSales();
        unsubExpenses();
      };
    });

    return () => unsubscribe();
  }, [router]);

  const reference = useMemo(() => new Date(refDate + "T00:00:00"), [refDate]);
  const { start, end } = useMemo(() => getRange(period, reference), [period, reference]);

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });
  }, [sales, start, end]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
  }, [expenses, start, end]);

  const totalSalesRevenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
  const totalSalesProfit = filteredSales.reduce((sum, s) => sum + (s.profit ?? 0), 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalSalesProfit - totalExpenses;

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setSavingExpense(true);

    try {
      await addDoc(collection(db, "tenants", uid, "expenses"), {
        description: expDescription,
        amount: Number(expAmount),
        date: new Date(expDate + "T12:00:00").toISOString(),
      });
      setExpDescription("");
      setExpAmount("");
      setExpDate(new Date().toISOString().slice(0, 10));
      setShowExpenseForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDownload = () => {
    const rows: string[] = [];

    rows.push("SALES");
    rows.push("Item,Quantity,Total,Profit,Date");
    filteredSales.forEach((s) => {
      rows.push(
        `"${s.itemName}",${s.quantity},${s.total},${s.profit ?? 0},${new Date(
          s.date
        ).toLocaleString()}`
      );
    });
    rows.push("");

    rows.push("EXPENSES");
    rows.push("Description,Amount,Date");
    filteredExpenses.forEach((e) => {
      rows.push(`"${e.description}",${e.amount},${new Date(e.date).toLocaleString()}`);
    });
    rows.push("");

    rows.push("SUMMARY");
    rows.push(`Total Sales,${totalSalesRevenue}`);
    rows.push(`Total Expenses,${totalExpenses}`);
    rows.push(`Net Profit,${netProfit}`);

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-expenses-${period.toLowerCase()}-${refDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1
              className="text-xl font-bold"
              style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
            >
              Sales & Expenses
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {formatPeriodLabel(period, reference)}
            </p>
          </div>
          <button
            onClick={handleDownload}
            className="font-semibold px-4 py-2 text-sm hover:opacity-90"
            style={{
              background: "var(--gradient-accent)",
              color: "#fff",
              borderRadius: "var(--radius-button)",
              boxShadow: "var(--glow-shadow)",
            }}
          >
            ⬇ Download Report
          </button>
        </div>

        {/* Period chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(["Day", "Week", "Month", "Year"] as Period[]).map((p) => {
            const isActive = period === p;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition"
                style={{
                  background: isActive ? "var(--color-primary)" : "var(--color-surface)",
                  color: isActive ? "#fff" : "var(--color-text-secondary)",
                  boxShadow: isActive ? "var(--glow-shadow)" : "none",
                  borderWidth: isActive ? 0 : "var(--border-width)",
                  borderColor: "var(--color-border)",
                }}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-3 mb-6">
          <input
            type="date"
            value={refDate}
            onChange={(e) => setRefDate(e.target.value)}
            className="px-3 py-2"
            style={inputStyle}
          />
          <button
            onClick={() => setRefDate(new Date().toISOString().slice(0, 10))}
            className="text-sm hover:underline"
            style={{ color: "var(--color-primary-light)" }}
          >
            Today
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="p-5" style={cardStyle}>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Total Sales
            </p>
            <p
              className="text-2xl font-bold mt-1"
              style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
            >
              ₱{totalSalesRevenue.toLocaleString()}
            </p>
          </div>
          <div className="p-5" style={cardStyle}>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Total Expenses
            </p>
            <p
              className="text-2xl font-bold mt-1"
              style={{ color: "#f87171", fontFamily: "var(--font-heading)" }}
            >
              ₱{totalExpenses.toLocaleString()}
            </p>
          </div>
          <div className="p-5" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Net Profit
            </p>
            <p
              className="text-2xl font-bold mt-1"
              style={{
                color: netProfit >= 0 ? "#4ade80" : "#f87171",
                fontFamily: "var(--font-heading)",
              }}
            >
              ₱{netProfit.toLocaleString()}
            </p>
          </div>
        </div>

        {/* ===== SALES SECTION ===== */}
        <div className="mb-10">
          <div className="flex justify-between items-center mb-3">
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
            >
              💰 Sales
            </h2>
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {filteredSales.length} transactions
            </span>
          </div>

          {filteredSales.length === 0 ? (
            <div className="p-8 text-center" style={{ ...cardStyle, color: "var(--color-text-secondary)" }}>
              No sales recorded for this period.
            </div>
          ) : (
            <div className="overflow-hidden" style={cardStyle}>
              <table className="w-full text-sm">
                <thead
                  className="text-left"
                  style={{ background: "rgba(74, 222, 128, 0.1)", color: "#4ade80" }}
                >
                  <tr>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Total</th>
                    <th className="px-4 py-2">Profit</th>
                    <th className="px-4 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => (
                    <tr
                      key={sale.id}
                      style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}
                    >
                      <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                        {sale.itemName}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>
                        {sale.quantity}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                        ₱{sale.total.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: "#4ade80" }}>
                        ₱{(sale.profit ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        {new Date(sale.date).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className="font-semibold"
                    style={{
                      borderTopWidth: "var(--border-width)",
                      borderColor: "var(--color-border)",
                      background: "rgba(74, 222, 128, 0.06)",
                    }}
                  >
                    <td className="px-4 py-2" colSpan={2} style={{ color: "var(--color-text-primary)" }}>
                      Total
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                      ₱{totalSalesRevenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-2" style={{ color: "#4ade80" }}>
                      ₱{totalSalesProfit.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ===== EXPENSES SECTION ===== */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
            >
              💸 Expenses
            </h2>
            <button
              onClick={() => setShowExpenseForm(true)}
              className="font-semibold px-4 py-1.5 text-sm hover:opacity-90"
              style={{
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
                borderRadius: "var(--radius-button)",
                borderWidth: "var(--border-width)",
                borderColor: "var(--color-border)",
              }}
            >
              + Add Expense
            </button>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="p-8 text-center" style={{ ...cardStyle, color: "var(--color-text-secondary)" }}>
              No expenses recorded for this period.
            </div>
          ) : (
            <div className="overflow-hidden" style={cardStyle}>
              <table className="w-full text-sm">
                <thead
                  className="text-left"
                  style={{ background: "rgba(248, 113, 113, 0.1)", color: "#f87171" }}
                >
                  <tr>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((exp) => (
                    <tr
                      key={exp.id}
                      style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}
                    >
                      <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                        {exp.description}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: "#f87171" }}>
                        -₱{exp.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        {new Date(exp.date).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className="font-semibold"
                    style={{
                      borderTopWidth: "var(--border-width)",
                      borderColor: "var(--color-border)",
                      background: "rgba(248, 113, 113, 0.06)",
                    }}
                  >
                    <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                      Total
                    </td>
                    <td className="px-4 py-2" style={{ color: "#f87171" }}>
                      -₱{totalExpenses.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Add Expense modal */}
        {showExpenseForm && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form
              onSubmit={handleAddExpense}
              className="w-full max-w-md p-6 space-y-4"
              style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}
            >
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  New Expense
                </p>
                <button
                  type="button"
                  onClick={() => setShowExpenseForm(false)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Description
                </label>
                <input
                  required
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. Bought soldering iron"
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Amount (₱)
                </label>
                <input
                  required
                  type="number"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Date
                </label>
                <input
                  required
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={savingExpense}
                className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                style={{
                  background: "var(--gradient-accent)",
                  color: "#fff",
                  borderRadius: "var(--radius-button)",
                  boxShadow: "var(--glow-shadow)",
                }}
              >
                {savingExpense ? "Saving..." : "Save Expense"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}