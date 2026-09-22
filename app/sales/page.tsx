"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  increment,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";
import Sidebar from "../components/Sidebar";
import { canAccessPage, homeFor } from "../lib/permissions";
import { can, type Role } from "../lib/permissions";

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
  const [role, setRole] = useState<Role>("cashier");
  const canEditSales = can(role, "sales.edit");
  const canDeleteExpense = can(role, "expenses.delete");
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

  // ---- Sale editing/deleting ----
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);
  const [editSaleItemName, setEditSaleItemName] = useState("");
  const [editSaleQuantity, setEditSaleQuantity] = useState("");
  const [editSalePrice, setEditSalePrice] = useState("");
  const [editSaleProfit, setEditSaleProfit] = useState("");
  const [editSaleDate, setEditSaleDate] = useState("");
  const [savingSaleEdit, setSavingSaleEdit] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);

  // ---- Expense editing/deleting ----
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [editExpDescription, setEditExpDescription] = useState("");
  const [editExpAmount, setEditExpAmount] = useState("");
  const [editExpDate, setEditExpDate] = useState("");
  const [savingExpenseEdit, setSavingExpenseEdit] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    let unsubSales = () => {};
    let unsubExpenses = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      unsubSales();
      unsubExpenses();

      if (!user) {
        router.push("/login");
        return;
      }

      const session = await getSessionInfo(user);
      setRole(session.role);
            if (!canAccessPage(session.role, "/sales")) {
        router.push(homeFor(session.role));
        return;
      }
      const tenantId = session.tenantId;
      setUid(tenantId);

      const salesQuery = query(
        collection(db, "tenants", tenantId, "sales"),
        orderBy("date", "desc")
      );
      unsubSales = onSnapshot(salesQuery, (snapshot) => {
        setSales(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as SaleRecord[]
        );
      });

      const expenseQuery = query(
        collection(db, "tenants", tenantId, "expenses"),
        orderBy("date", "desc")
      );
      unsubExpenses = onSnapshot(expenseQuery, (snapshot) => {
        setExpenses(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseRecord[]
        );
      });
    });

    return () => {
      unsubscribeAuth();
      unsubSales();
      unsubExpenses();
    };
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



    // ---- Sale editing ----
  const openEditSale = (sale: SaleRecord) => {
    setEditingSale(sale);
    setEditSaleItemName(sale.itemName);
    setEditSaleQuantity(String(sale.quantity));
    setEditSalePrice(String(sale.price));
    setEditSaleProfit(String(sale.profit ?? 0));
    setEditSaleDate(new Date(sale.date).toISOString().slice(0, 16));
  };

  const handleSaveSaleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !editingSale) return;
    setSavingSaleEdit(true);
    try {
      const quantity = Number(editSaleQuantity) || 0;
      const price = Number(editSalePrice) || 0;
      await updateDoc(doc(db, "tenants", uid, "sales", editingSale.id), {
        itemName: editSaleItemName,
        quantity,
        price,
        total: quantity * price,
        profit: Number(editSaleProfit) || 0,
        date: new Date(editSaleDate).toISOString(),
      });
      setEditingSale(null);
    } catch (err) {
      console.error("Failed to update sale:", err);
      window.alert("Something went wrong updating this sale. Please try again.");
    } finally {
      setSavingSaleEdit(false);
    }
  };

  // A sale is only eligible for auto-restock if it's a plain item/bundle sale
  // (not a Repair/Delivery/P.O. ticket, which already manages its own stock).
  const isTicketDerivedSale = (itemName: string) =>
    itemName.startsWith("Repair:") || itemName.startsWith("Delivery:") || itemName.startsWith("P.O.");

  const handleDeleteSale = async (sale: SaleRecord) => {
    if (!uid) return;

    const fromTicket = isTicketDerivedSale(sale.itemName);
    const confirmMessage = fromTicket
      ? `Delete this sale record ("${sale.itemName}")? This is linked to a ticket, so inventory stock will NOT be automatically adjusted. This cannot be undone.`
      : `Delete this sale record ("${sale.itemName}")? If a matching item is found in your inventory, ${sale.quantity} unit(s) will be added back to its stock. This cannot be undone.`;

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    setDeletingSaleId(sale.id);
    try {
      if (!fromTicket) {
        // Best-effort restock: matched by exact item name, since sale records
        // don't store the original itemId. Bundle sales ("Name (Bundle)")
        // won't match a single inventory item and are safely skipped.
        const invSnap = await getDocs(collection(db, "tenants", uid, "inventory"));
        const match = invSnap.docs.find((d) => d.data().name === sale.itemName);
        if (match) {
          await updateDoc(doc(db, "tenants", uid, "inventory", match.id), {
            stock: increment(sale.quantity),
          });
        }
      }
      await deleteDoc(doc(db, "tenants", uid, "sales", sale.id));
    } catch (err) {
      console.error("Failed to delete sale:", err);
      window.alert("Something went wrong deleting this sale. Please try again.");
    } finally {
      setDeletingSaleId(null);
    }
  };

  // ---- Expense editing ----
  const openEditExpense = (expense: ExpenseRecord) => {
    setEditingExpense(expense);
    setEditExpDescription(expense.description);
    setEditExpAmount(String(expense.amount));
    setEditExpDate(new Date(expense.date).toISOString().slice(0, 10));
  };

  const handleSaveExpenseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !editingExpense) return;
    setSavingExpenseEdit(true);
    try {
      await updateDoc(doc(db, "tenants", uid, "expenses", editingExpense.id), {
        description: editExpDescription,
        amount: Number(editExpAmount) || 0,
        date: new Date(editExpDate + "T12:00:00").toISOString(),
      });
      setEditingExpense(null);
    } catch (err) {
      console.error("Failed to update expense:", err);
      window.alert("Something went wrong updating this expense. Please try again.");
    } finally {
      setSavingExpenseEdit(false);
    }
  };

  const handleDeleteExpense = async (expense: ExpenseRecord) => {
    if (!uid) return;
    const confirmed = window.confirm(`Delete this expense ("${expense.description}")? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingExpenseId(expense.id);
    try {
      await deleteDoc(doc(db, "tenants", uid, "expenses", expense.id));
    } catch (err) {
      console.error("Failed to delete expense:", err);
      window.alert("Something went wrong deleting this expense. Please try again.");
    } finally {
      setDeletingExpenseId(null);
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
      <main className="flex-1 min-w-0 p-6">
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
              <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "580px" }}>
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
                    <th className="px-4 py-2">Actions</th>
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
                      <td className="px-4 py-3">
                        
                        {canEditSales && (
                          <div className="flex gap-3">
                            <button
                              onClick={() => openEditSale(sale)}
                              className="text-xs font-medium hover:underline"
                              style={{ color: "var(--color-primary-light)" }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteSale(sale)}
                              disabled={deletingSaleId === sale.id}
                              className="text-xs font-medium hover:underline disabled:opacity-50"
                              style={{ color: "#f87171" }}
                            >
                              {deletingSaleId === sale.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        )}
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


                    <td></td>
                  </tr>
                </tfoot>
              </table>
              </div>
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
              <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "460px" }}>
                <thead
                  className="text-left"
                  style={{ background: "rgba(248, 113, 113, 0.1)", color: "#f87171" }}
                >
                  <tr>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Actions</th>
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
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button
                            onClick={() => openEditExpense(exp)}
                            className="text-xs font-medium hover:underline"
                            style={{ color: "var(--color-primary-light)" }}
                          >
                            Edit
                          </button>
                          {canDeleteExpense && (
                            <button
                              onClick={() => handleDeleteExpense(exp)}
                              disabled={deletingExpenseId === exp.id}
                              className="text-xs font-medium hover:underline disabled:opacity-50"
                              style={{ color: "#f87171" }}
                            >
                              {deletingExpenseId === exp.id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
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
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
          )}
        </div>


                  {/* Edit Sale modal */}
        {editingSale && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form
              onSubmit={handleSaveSaleEdit}
              className="w-full max-w-md p-6 space-y-4"
              style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}
            >
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  Edit Sale
                </p>
                <button
                  type="button"
                  onClick={() => setEditingSale(null)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Item Name</label>
                <input
                  required
                  value={editSaleItemName}
                  onChange={(e) => setEditSaleItemName(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm" style={labelStyle}>Quantity</label>
                  <input
                    required
                    type="number"
                    step="any"
                    value={editSaleQuantity}
                    onChange={(e) => setEditSaleQuantity(e.target.value)}
                    className="w-full mt-1 px-3 py-2"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-sm" style={labelStyle}>Price per Unit (₱)</label>
                  <input
                    required
                    type="number"
                    step="any"
                    value={editSalePrice}
                    onChange={(e) => setEditSalePrice(e.target.value)}
                    className="w-full mt-1 px-3 py-2"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Profit (₱)</label>
                <input
                  required
                  type="number"
                  step="any"
                  value={editSaleProfit}
                  onChange={(e) => setEditSaleProfit(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Date & Time</label>
                <input
                  required
                  type="datetime-local"
                  value={editSaleDate}
                  onChange={(e) => setEditSaleDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Total will be recalculated automatically as Quantity × Price.
              </p>

              <button
                type="submit"
                disabled={savingSaleEdit}
                className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                style={{
                  background: "var(--gradient-accent)",
                  color: "#fff",
                  borderRadius: "var(--radius-button)",
                  boxShadow: "var(--glow-shadow)",
                }}
              >
                {savingSaleEdit ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        )}

        {/* Edit Expense modal */}
        {editingExpense && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form
              onSubmit={handleSaveExpenseEdit}
              className="w-full max-w-md p-6 space-y-4"
              style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}
            >
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  Edit Expense
                </p>
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Description</label>
                <input
                  required
                  value={editExpDescription}
                  onChange={(e) => setEditExpDescription(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Amount (₱)</label>
                <input
                  required
                  type="number"
                  value={editExpAmount}
                  onChange={(e) => setEditExpAmount(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Date</label>
                <input
                  required
                  type="date"
                  value={editExpDate}
                  onChange={(e) => setEditExpDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={savingExpenseEdit}
                className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                style={{
                  background: "var(--gradient-accent)",
                  color: "#fff",
                  borderRadius: "var(--radius-button)",
                  boxShadow: "var(--glow-shadow)",
                }}
              >
                {savingExpenseEdit ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        )}



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