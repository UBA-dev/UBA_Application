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
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  increment,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";
import Sidebar from "../components/Sidebar";
import AiSpinner from "../components/AiSpinner";
import { printReceipt } from "../lib/receipt";
import PhoneNumberInput from "../components/PhoneNumberInput";
import { canAccessPage, homeFor } from "../lib/permissions";
import { authedFetch } from "../lib/authedFetch";



type InventoryItem = {
  id: string;
  name: string;
  stock: number;
  unit: string;
  unitCost: number;
  sellingPrice: number;
};

type ReorderSuggestion = {
  itemId: string;
  itemName: string;
  unit: string;
  currentStock: number;
  threshold: number;
  avgDailySales: number;
  daysRemaining: number;
  suggestedReorderQty: number;
  urgent: boolean;
};

type POItem = {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
};

type PaymentStatus = "Unpaid" | "Paid";
type FulfillmentStatus = "Pending" | "Fulfilled" | "Cancelled";

type PurchaseOrder = {
  id: string;
  poNumber: string;
  poDate: string;
  dueDate: string;
  prNumber: string;
  buyerName: string;
  buyerAddress: string;
  buyerContact: string;
  items: POItem[];
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  createdAt: string;
  updatedAt: string;
  salesRecorded?: boolean;
};

// ---- Number-to-words helper (matches the "Total Amount in Words" line on official PO forms) ----
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigitsToWords(n: number): string {
  let str = "";
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + " Hundred ";
    n %= 100;
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)] + " ";
    n %= 10;
  } else if (n >= 10) {
    str += ONES[n] + " ";
    n = 0;
  }
  if (n > 0) {
    str += ONES[n] + " ";
  }
  return str.trim();
}

function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const units = ["", "Thousand", "Million", "Billion"];
  const groups: number[] = [];
  let n = Math.floor(num);
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  let words = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] !== 0) {
      words += threeDigitsToWords(groups[i]) + " " + units[i] + " ";
    }
  }
  return words.trim();
}

export function amountToPesoWords(amount: number): string {
  const pesos = Math.floor(amount);
  const centavos = Math.round((amount - pesos) * 100);
  let result = numberToWords(pesos) + " Pesos";
  if (centavos > 0) {
    result += ` and ${numberToWords(centavos)} Centavos`;
  }
  return result + " Only";
}

const PAYMENT_COLORS: Record<PaymentStatus, { bg: string; text: string }> = {
  Unpaid: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
  Paid: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
};

const FULFILL_COLORS: Record<FulfillmentStatus, { bg: string; text: string }> = {
  Pending: { bg: "rgba(250, 204, 21, 0.15)", text: "#facc15" },
  Fulfilled: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
  Cancelled: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
};

const DEFAULT_COLOR = { bg: "rgba(148, 163, 184, 0.15)", text: "#94a3b8" };
const getPaymentColors = (s: PaymentStatus | undefined) => (s && PAYMENT_COLORS[s]) || DEFAULT_COLOR;
const getFulfillColors = (s: FulfillmentStatus | undefined) => (s && FULFILL_COLORS[s]) || DEFAULT_COLOR;

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  borderColor: "var(--color-border)",
  borderRadius: "var(--radius-button)",
  borderWidth: "var(--border-width)",
};
const labelStyle: React.CSSProperties = { color: "var(--color-text-secondary)" };
const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  borderRadius: "var(--radius-card)",
  borderWidth: "var(--border-width)",
  borderColor: "var(--color-border)",
};

function daysSince(dateStr: string): number {
  const created = new Date(dateStr).getTime();
  if (isNaN(created)) return 0;
  return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
}

function AgingBadge({ createdAt, warnAfterDays }: { createdAt: string; warnAfterDays: number }) {
  const days = daysSince(createdAt);
  const isOverdue = days >= warnAfterDays;
  const label = days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{
        background: isOverdue ? "rgba(239, 68, 68, 0.15)" : "rgba(148, 163, 184, 0.15)",
        color: isOverdue ? "#f87171" : "#94a3b8",
      }}
    >
      {isOverdue ? "⏰ " : ""}{label}
    </span>
  );
}

const FULFILLMENT_FILTERS: FulfillmentStatus[] = ["Pending", "Fulfilled", "Cancelled"];

export default function POTicketsPage() {
  const [tickets, setTickets] = useState<PurchaseOrder[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<"All" | FulfillmentStatus>("All");
  const [searchText, setSearchText] = useState("");

  const [showNewForm, setShowNewForm] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [newItems, setNewItems] = useState<POItem[]>([]);
  const [itemSearchText, setItemSearchText] = useState("");
  const [savingTicket, setSavingTicket] = useState(false);

  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [editPoNumber, setEditPoNumber] = useState("");
  const [editPoDate, setEditPoDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPrNumber, setEditPrNumber] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [computingReorder, setComputingReorder] = useState(false);
  const [reorderSuggestions, setReorderSuggestions] = useState<ReorderSuggestion[] | null>(null);
  const [reorderSummary, setReorderSummary] = useState("");
  const [reorderError, setReorderError] = useState("");
  const [draftingMessage, setDraftingMessage] = useState(false);
  const [draftedMessage, setDraftedMessage] = useState("");
  const [messageError, setMessageError] = useState("");

  useEffect(() => {
    let unsubTickets = () => {};
    let unsubInv = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      unsubTickets();
      unsubInv();

      if (!user) {
        router.push("/login");
        return;
      }

      const session = await getSessionInfo(user);
            if (!canAccessPage(session.role, "/sales")) {
        router.push(homeFor(session.role));
        return;
      }
      const tenantId = session.tenantId;
      setUid(tenantId);

      getDoc(doc(db, "tenants", tenantId)).then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setBusinessName(data.businessName || "");
          if (data.enabledFeatures?.poTickets === false) {
            router.push("/dashboard");
          }
        }
      });

      const ticketQuery = query(
        collection(db, "tenants", tenantId, "poTickets"),
        orderBy("createdAt", "desc")
      );
      unsubTickets = onSnapshot(ticketQuery, (snapshot) => {
        setTickets(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as PurchaseOrder[]);
      });

      const invQuery = query(collection(db, "tenants", tenantId, "inventory"), orderBy("name"));
      unsubInv = onSnapshot(invQuery, (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as InventoryItem[]);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubTickets();
      unsubInv();
    };
  }, [router]);

  useEffect(() => {
    if (!detail) return;
    const fresh = tickets.find((t) => t.id === detail.id);
    if (fresh) setDetail(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  const filteredItemsForPO = useMemo(() => {
    const searchLower = itemSearchText.toLowerCase().trim();
    if (!searchLower) return items;
    return items.filter((i) => i.name.toLowerCase().includes(searchLower));
  }, [items, itemSearchText]);

  const filteredTickets = useMemo(() => {
    const searchLower = searchText.toLowerCase().trim();
    return tickets.filter((t) => {
      const matchesStatus = statusFilter === "All" || t.fulfillmentStatus === statusFilter;
      if (!matchesStatus) return false;
      if (!searchLower) return true;
      return (
        t.buyerName.toLowerCase().includes(searchLower) ||
        t.poNumber.toLowerCase().includes(searchLower) ||
        t.prNumber.toLowerCase().includes(searchLower)
      );
    });
  }, [tickets, statusFilter, searchText]);

  const addNewItem = (item: InventoryItem) => {
    if (item.stock <= 0) return;
    const existing = newItems.find((p) => p.itemId === item.id);
    if (existing) {
      setNewItems(newItems.map((p) => (p.itemId === item.id ? { ...p, quantity: p.quantity + 1 } : p)));
    } else {
      setNewItems([
        ...newItems,
        { itemId: item.id, itemName: item.name, unit: item.unit || "Piece", quantity: 1, unitCost: item.unitCost || 0 },
      ]);
    }
  };

  const removeNewItem = (itemId: string) => {
    const existing = newItems.find((p) => p.itemId === itemId);
    if (!existing) return;
    if (existing.quantity <= 1) {
      setNewItems(newItems.filter((p) => p.itemId !== itemId));
    } else {
      setNewItems(newItems.map((p) => (p.itemId === itemId ? { ...p, quantity: p.quantity - 1 } : p)));
    }
  };

  const resetNewForm = () => {
    setBuyerName("");
    setBuyerAddress("");
    setBuyerContact("");
    setPrNumber("");
    setPoNumber("");
    setPoDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setNewItems([]);
    setItemSearchText("");
  };

  // Safely adjust an inventory item's stock. Checks that the document still
  // exists before calling updateDoc, since items referenced by older P.O.s
  // can point to inventory items that were later deleted.
  const safeAdjustStock = async (uidParam: string, itemId: string, delta: number): Promise<boolean> => {
    const ref = doc(db, "tenants", uidParam, "inventory", itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    await updateDoc(ref, { stock: increment(delta) });
    return true;
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setSavingTicket(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, "tenants", uid, "poTickets"), {
        poNumber,
        poDate: new Date(poDate).toISOString(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : "",
        prNumber,
        buyerName,
        buyerAddress,
        buyerContact,
        items: newItems,
        paymentStatus: "Unpaid" as PaymentStatus,
        fulfillmentStatus: "Pending" as FulfillmentStatus,
        createdAt: now,
        updatedAt: now,
        salesRecorded: false,
      });
      for (const it of newItems) {
        await safeAdjustStock(uid, it.itemId, -it.quantity);
      }
      resetNewForm();
      setShowNewForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTicket(false);
    }
  };

  const itemsCostOf = (ticket: PurchaseOrder) =>
    ticket.items.reduce((sum, p) => sum + p.unitCost * p.quantity, 0);

  const openDetail = (ticket: PurchaseOrder) => {
    setDetail(ticket);
    setEditPoNumber(ticket.poNumber);
    setEditPoDate(ticket.poDate ? ticket.poDate.slice(0, 10) : "");
    setEditDueDate(ticket.dueDate ? ticket.dueDate.slice(0, 10) : "");
    setEditPrNumber(ticket.prNumber || "");
    setDraftedMessage("");
    setMessageError("");
  };

  const handleDraftMessage = async () => {
    if (!detail) return;
    setDraftingMessage(true);
    setMessageError("");
    setDraftedMessage("");
    try {
      const res = await authedFetch("/api/generate-ticket-message", {
        method: "POST",
        body: JSON.stringify({
          ticketType: "purchase order",
          customerName: detail.buyerName,
          statusLabel: `Payment: ${detail.paymentStatus}, Fulfillment: ${detail.fulfillmentStatus}`,
          details: `PO No. ${detail.poNumber}`,
          totalAmount: itemsCostOf(detail),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessageError(data.error || "Couldn't draft a message right now.");
        return;
      }
      setDraftedMessage(data.message);
    } catch (err) {
      console.error(err);
      setMessageError("Couldn't draft a message right now.");
    } finally {
      setDraftingMessage(false);
    }
  };

  // Computes real reorder math from actual sales history — the AI only
  // narrates this afterward, it never invents these numbers itself.
  const handleComputeReorderSuggestions = async () => {
    if (!uid) return;
    setComputingReorder(true);
    setReorderError("");
    setReorderSuggestions(null);
    setReorderSummary("");

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const salesSnap = await getDocs(collection(db, "tenants", uid, "sales"));
      const recentSales = salesSnap.docs
        .map((d) => d.data())
        .filter((s: any) => new Date(s.date) >= thirtyDaysAgo);

      const salesByItem = new Map<string, number>();
      recentSales.forEach((s: any) => {
        const qty = Number(s.quantity) || 0;
        salesByItem.set(s.itemName, (salesByItem.get(s.itemName) || 0) + qty);
      });

      const suggestions: ReorderSuggestion[] = [];
      for (const item of items) {
        const totalSoldLast30 = salesByItem.get(item.name) || 0;
        const avgDailySales = totalSoldLast30 / 30;

        // Only flag items that are actually selling AND running low —
        // no point suggesting a reorder for something that never moves.
        if (avgDailySales <= 0) continue;

        const daysRemaining = Math.floor(item.stock / avgDailySales);
        const isLowStock = item.stock <= (item as any).threshold || daysRemaining <= 14;
        if (!isLowStock) continue;

        // Target: enough stock to cover 30 days at current sales pace
        const targetStock = Math.ceil(avgDailySales * 30);
        const suggestedReorderQty = Math.max(targetStock - item.stock, 0);

        suggestions.push({
          itemId: item.id,
          itemName: item.name,
          unit: item.unit || "Piece",
          currentStock: item.stock,
          threshold: (item as any).threshold || 0,
          avgDailySales,
          daysRemaining,
          suggestedReorderQty,
          urgent: daysRemaining <= 5,
        });
      }

      suggestions.sort((a, b) => a.daysRemaining - b.daysRemaining);
      setReorderSuggestions(suggestions);

      if (suggestions.length > 0) {
        const res = await authedFetch("/api/generate-reorder-summary", {
          method: "POST",
          body: JSON.stringify({ suggestions }),
        });
        const data = await res.json();
        if (res.ok) setReorderSummary(data.summary);
      }
    } catch (err) {
      console.error(err);
      setReorderError("Couldn't compute reorder suggestions right now.");
    } finally {
      setComputingReorder(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!uid || !detail) return;
    setSavingDetails(true);
    try {
      await updateDoc(doc(db, "tenants", uid, "poTickets", detail.id), {
        poNumber: editPoNumber,
        poDate: editPoDate ? new Date(editPoDate).toISOString() : detail.poDate,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : "",
        prNumber: editPrNumber,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const recordTicketAsSale = async (uidParam: string, ticket: PurchaseOrder) => {
    const total = itemsCostOf(ticket);
    await addDoc(collection(db, "tenants", uidParam, "sales"), {
      itemName: `P.O. ${ticket.poNumber} (${ticket.buyerName})`,
      quantity: 1,
      price: total,
      total,
      profit: 0,
      serialNumberUsed: null,
      date: new Date().toISOString(),
      source: "poTicket",
      poTicketId: ticket.id,
    });
  };

  const handleChangePaymentStatus = async (ticket: PurchaseOrder, newStatus: PaymentStatus) => {
    if (!uid || changingStatus) return;
    setChangingStatus(true);
    try {
      const shouldRecordSale = newStatus === "Paid" && !ticket.salesRecorded;
      if (shouldRecordSale) await recordTicketAsSale(uid, ticket);
      await updateDoc(doc(db, "tenants", uid, "poTickets", ticket.id), {
        paymentStatus: newStatus,
        updatedAt: new Date().toISOString(),
        ...(shouldRecordSale ? { salesRecorded: true } : {}),
      });
    } catch (err) {
      console.error(err);
      window.alert("Something went wrong updating payment status. Please try again.");
    } finally {
      setChangingStatus(false);
    }
  };

  const handleChangeFulfillmentStatus = async (ticket: PurchaseOrder, newStatus: FulfillmentStatus) => {
    if (!uid || changingStatus) return;
    setChangingStatus(true);
    try {
      if (newStatus === "Cancelled" && ticket.items.length > 0) {
        const confirmed = window.confirm(
          "Cancelling this P.O. will return all listed items back to inventory stock. Continue?"
        );
        if (!confirmed) {
          setChangingStatus(false);
          return;
        }
        for (const it of ticket.items) {
          await safeAdjustStock(uid, it.itemId, it.quantity);
        }
      }
      await updateDoc(doc(db, "tenants", uid, "poTickets", ticket.id), {
        fulfillmentStatus: newStatus,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      window.alert("Something went wrong updating fulfillment status. Please try again.");
    } finally {
      setChangingStatus(false);
    }
  };

  const handleAddItem = async (item: InventoryItem) => {
    if (!uid || !detail) return;
    if (item.stock <= 0) return;

    const existing = detail.items.find((p) => p.itemId === item.id);
    const updatedItems = existing
      ? detail.items.map((p) => (p.itemId === item.id ? { ...p, quantity: p.quantity + 1 } : p))
      : [
          ...detail.items,
          { itemId: item.id, itemName: item.name, unit: item.unit || "Piece", quantity: 1, unitCost: item.unitCost || 0 },
        ];

    try {
      await updateDoc(doc(db, "tenants", uid, "poTickets", detail.id), {
        items: updatedItems,
        updatedAt: new Date().toISOString(),
      });
      await safeAdjustStock(uid, item.id, -1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveItem = async (part: POItem) => {
    if (!uid || !detail) return;
    const updatedItems =
      part.quantity <= 1
        ? detail.items.filter((p) => p.itemId !== part.itemId)
        : detail.items.map((p) => (p.itemId === part.itemId ? { ...p, quantity: p.quantity - 1 } : p));

    try {
      await updateDoc(doc(db, "tenants", uid, "poTickets", detail.id), {
        items: updatedItems,
        updatedAt: new Date().toISOString(),
      });
      await safeAdjustStock(uid, part.itemId, 1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTicket = async (ticket: PurchaseOrder) => {
    if (!uid) return;
    const confirmed = window.confirm(`Delete P.O. "${ticket.poNumber}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      for (const it of ticket.items) {
        await safeAdjustStock(uid, it.itemId, it.quantity);
      }
      await deleteDoc(doc(db, "tenants", uid, "poTickets", ticket.id));
      setDetail(null);
    } catch (err) {
      console.error(err);
    }
  };

  const isLocked = (status: FulfillmentStatus) => status === "Cancelled" || status === "Fulfilled";

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <main className="flex-1 min-w-0 p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>
              P.O. / Purchase Order
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Track purchase orders from buyers, item by item
            </p>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="font-semibold px-4 py-2 text-sm hover:opacity-90"
            style={{ background: "var(--gradient-accent)", color: "#fff", borderRadius: "var(--radius-button)", boxShadow: "var(--glow-shadow)" }}
          >
            + New P.O.
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by buyer name, PO No., or PR No..."
            className="w-full px-4 py-2"
            style={inputStyle}
          />
        </div>

        {/* Fulfillment status filter chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(["All", ...FULFILLMENT_FILTERS] as const).map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s as "All" | FulfillmentStatus)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition"
                style={{
                  background: isActive ? "var(--color-primary)" : "var(--color-surface)",
                  color: isActive ? "#fff" : "var(--color-text-secondary)",
                  boxShadow: isActive ? "var(--glow-shadow)" : "none",
                  borderWidth: isActive ? 0 : "var(--border-width)",
                  borderColor: "var(--color-border)",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/* AI Smart Reorder Suggestions */}
        <div className="mb-6 p-4" style={cardStyle}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              🤖 Smart Reorder Suggestions
            </p>
            <button
              onClick={handleComputeReorderSuggestions}
              disabled={computingReorder}
              className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50 hover:opacity-90"
              style={{ background: "var(--gradient-accent)", color: "#fff" }}
            >
              {computingReorder ? (
                <span className="inline-flex items-center gap-2">
                  <AiSpinner /> Computing...
                </span>
              ) : (
                "Get Suggestions"
              )}
            </button>
          </div>
          <p className="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>
            Based on your last 30 days of sales — flags items about to run out and how much to reorder.
          </p>
          {reorderError && (
            <p className="text-xs p-2 rounded-lg" style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.1)" }}>
              {reorderError}
            </p>
          )}
          {reorderSuggestions && reorderSuggestions.length === 0 && (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              No urgent reorders needed right now based on your recent sales pace.
            </p>
          )}
          {reorderSummary && (
            <p className="text-xs p-2 mb-3 rounded-lg" style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}>
              {reorderSummary}
            </p>
          )}
          {reorderSuggestions && reorderSuggestions.length > 0 && (
            <div className="space-y-2">
              {reorderSuggestions.map((s) => (
                <div
                  key={s.itemId}
                  className="flex justify-between items-center p-3"
                  style={{
                    background: "var(--color-bg-secondary)",
                    borderRadius: "var(--radius-button)",
                    borderWidth: s.urgent ? "1px" : 0,
                    borderColor: "#f87171",
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {s.itemName} {s.urgent && <span style={{ color: "#f87171" }}>⚠️ Urgent</span>}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {s.currentStock} {s.unit} left · ~{s.daysRemaining} days remaining
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Reorder</p>
                    <p className="text-sm font-bold" style={{ color: "var(--color-primary-light)" }}>
                      {s.suggestedReorderQty} {s.unit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {filteredTickets.length === 0 ? (
          <div className="p-8 text-center" style={{ ...cardStyle, color: "var(--color-text-secondary)" }}>
            No purchase orders found. Click &quot;+ New P.O.&quot; to log one.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTickets.map((ticket) => {
              const pColors = getPaymentColors(ticket.paymentStatus);
              const fColors = getFulfillColors(ticket.fulfillmentStatus);
              return (
                <button key={ticket.id} onClick={() => openDetail(ticket)} className="text-left p-4 transition hover:opacity-90" style={cardStyle}>
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{ticket.buyerName}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>PO No. {ticket.poNumber}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: fColors.bg, color: fColors.text }}>
                        {ticket.fulfillmentStatus || "Pending"}
                      </span>
                      <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: pColors.bg, color: pColors.text }}>
                        {ticket.paymentStatus || "Unpaid"}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-2 mb-2">
                    <span style={{ color: "var(--color-text-secondary)" }}>{ticket.items?.length || 0} item(s)</span>
                    <span className="font-semibold" style={{ color: "var(--color-primary-light)" }}>₱{itemsCostOf(ticket).toLocaleString()}</span>
                  </div>
                  {!isLocked(ticket.fulfillmentStatus) && (
                    <AgingBadge createdAt={ticket.createdAt} warnAfterDays={7} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ---- NEW P.O. MODAL ---- */}
        {showNewForm && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form onSubmit={handleCreateTicket} className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto space-y-4" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>New Purchase Order</p>
                <button type="button" onClick={() => setShowNewForm(false)} className="text-xl leading-none hover:opacity-70" style={{ color: "var(--color-text-secondary)" }}>×</button>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Buyer Name</label>
                <input required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="w-full mt-1 px-3 py-2" style={inputStyle} placeholder="Enter buyer name" />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Address</label>
                <input required value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} className="w-full mt-1 px-3 py-2" style={inputStyle} placeholder="Enter address" />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Contact No.</label>
                <div className="mt-1">
                  <PhoneNumberInput value={buyerContact} onChange={setBuyerContact} inputStyle={inputStyle} required />
                </div>
              </div>
              <div>
                <label className="text-sm" style={labelStyle}>PR No.</label>
                <input
                  value={prNumber}
                  onChange={(e) => setPrNumber(e.target.value.replace(/[^0-9-]/g, ""))}
                  inputMode="numeric"
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="Numbers only, e.g. 2026-045"
                />
              </div>



              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm" style={labelStyle}>PO No.</label>
                  <input
                    required
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value.replace(/[^0-9-]/g, ""))}
                    inputMode="numeric"
                    className="w-full mt-1 px-3 py-2"
                    style={inputStyle}
                    placeholder="Numbers only, e.g. 559-2026"
                  />
                </div>


                <div>
                  <label className="text-sm" style={labelStyle}>PO Date</label>
                  <input required type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className="w-full mt-1 px-3 py-2" style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Payment Due Date (optional)</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full mt-1 px-3 py-2" style={inputStyle} />
              </div>

              <div className="pt-2" style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}>
                <label className="text-sm font-medium" style={labelStyle}>
                  Search and tap items to add them to this P.O.
                </label>
                <input
                  type="text"
                  value={itemSearchText}
                  onChange={(e) => setItemSearchText(e.target.value)}
                  placeholder="Search item name..."
                  className="w-full mt-2 mb-2 px-3 py-2"
                  style={inputStyle}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto p-1">
                  {filteredItemsForPO.length === 0 ? (
                    <p className="col-span-full text-sm py-3 text-center" style={{ color: "var(--color-text-secondary)" }}>
                      {items.length === 0 ? "No inventory items available." : "No items match your search."}
                    </p>
                  ) : (
                    filteredItemsForPO.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addNewItem(item)}
                        disabled={item.stock <= 0}
                        className="p-3 text-left transition hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)", borderWidth: "var(--border-width)", borderColor: "var(--color-border)" }}
                      >
                        <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{item.name}</p>
                        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Stock: {item.stock} {item.unit || "Piece"}</p>
                      </button>
                    ))
                  )}
                </div>

                {newItems.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium mb-2" style={labelStyle}>Added to this P.O.:</p>
                    <div className="space-y-2">
                      {newItems.map((p) => (
                        <div key={p.itemId} className="flex justify-between items-center px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-bg-secondary)" }}>
                          <span style={{ color: "var(--color-text-primary)" }}>{p.itemName} ({p.unit})</span>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => removeNewItem(p.itemId)} className="w-6 h-6 rounded-full font-bold" style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}>−</button>
                            <span style={{ color: "var(--color-text-primary)" }}>{p.quantity}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const inv = items.find((i) => i.id === p.itemId);
                                if (inv) addNewItem(inv);
                              }}
                              className="w-6 h-6 rounded-full font-bold"
                              style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={savingTicket}
                className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                style={{
                  background: "var(--gradient-accent)",
                  color: "#fff",
                  borderRadius: "var(--radius-button)",
                  boxShadow: "var(--glow-shadow)",
                }}
              >
                {savingTicket ? "Saving..." : "Create P.O."}
              </button>
            </form>
          </div>
        )}

        {/* ---- P.O. DETAIL MODAL ---- */}
        {detail && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>
                    {detail.buyerName}
                  </h3>
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>PO No. {detail.poNumber}</p>
                </div>
                <button onClick={() => setDetail(null)} className="text-xl leading-none hover:opacity-70" style={{ color: "var(--color-text-secondary)" }}>×</button>
              </div>

              <div className="mb-5 p-3 text-xs" style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)" }}>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <p style={{ color: "var(--color-text-secondary)" }}><strong>Address:</strong> {detail.buyerAddress}</p>
                  <p style={{ color: "var(--color-text-secondary)" }}><strong>Contact No.:</strong> {detail.buyerContact}</p>
                </div>
                <p className="text-sm font-medium mb-2" style={labelStyle}>PO Details (editable)</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-[11px]" style={labelStyle}>PO No.</label>
                    <input
                      value={editPoNumber}
                      onChange={(e) => setEditPoNumber(e.target.value.replace(/[^0-9-]/g, ""))}
                      inputMode="numeric"
                      className="w-full mt-1 px-2 py-1.5 text-xs"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[11px]" style={labelStyle}>PR No.</label>
                    <input
                      value={editPrNumber}
                      onChange={(e) => setEditPrNumber(e.target.value.replace(/[^0-9-]/g, ""))}
                      inputMode="numeric"
                      className="w-full mt-1 px-2 py-1.5 text-xs"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[11px]" style={labelStyle}>PO Date</label>
                    <input type="date" value={editPoDate} onChange={(e) => setEditPoDate(e.target.value)} className="w-full mt-1 px-2 py-1.5 text-xs" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[11px]" style={labelStyle}>Payment Due Date</label>
                    <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="w-full mt-1 px-2 py-1.5 text-xs" style={inputStyle} />
                  </div>
                </div>
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails}
                  className="text-xs font-semibold px-3 py-1.5 disabled:opacity-50 hover:opacity-90"
                  style={{ background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-button)" }}
                >
                  {savingDetails ? "Saving..." : "Save PO Details"}
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium mb-2" style={labelStyle}>Payment Status</p>
                <div className="flex gap-2">
                  {(["Unpaid", "Paid"] as PaymentStatus[]).map((s) => {
                    const isActive = detail.paymentStatus === s;
                    const colors = PAYMENT_COLORS[s];
                    return (
                      <button key={s} onClick={() => handleChangePaymentStatus(detail, s)} disabled={changingStatus}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition disabled:opacity-40"
                        style={{ background: isActive ? colors.bg : "var(--color-bg-secondary)", color: isActive ? colors.text : "var(--color-text-secondary)" }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
                {detail.paymentStatus === "Paid" && detail.salesRecorded && (
                  <p className="text-xs mt-2" style={{ color: "#4ade80" }}>✓ Recorded in Sales</p>
                )}
              </div>

              <div className="mb-6">
                <p className="text-sm font-medium mb-2" style={labelStyle}>Fulfillment Status</p>
                <div className="flex flex-wrap gap-2">
                  {(["Pending", "Fulfilled"] as FulfillmentStatus[]).map((s) => {
                    const isActive = detail.fulfillmentStatus === s;
                    const colors = FULFILL_COLORS[s];
                    return (
                      <button key={s} onClick={() => handleChangeFulfillmentStatus(detail, s)}
                        disabled={isLocked(detail.fulfillmentStatus) || changingStatus}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: isActive ? colors.bg : "var(--color-bg-secondary)", color: isActive ? colors.text : "var(--color-text-secondary)" }}>
                        {s}
                      </button>
                    );
                  })}
                  {!isLocked(detail.fulfillmentStatus) && (
                    <button onClick={() => handleChangeFulfillmentStatus(detail, "Cancelled")} disabled={changingStatus}
                      className="px-3 py-1.5 rounded-full text-xs font-medium hover:opacity-80 disabled:opacity-40"
                      style={{ background: FULFILL_COLORS.Cancelled.bg, color: FULFILL_COLORS.Cancelled.text }}>
                      Cancel P.O.
                    </button>
                  )}
                </div>
              </div>

              {/* AI Customer Message Drafter */}
              <div className="mb-5 p-3" style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium" style={labelStyle}>🤖 Message to Buyer</p>
                  <button
                    onClick={handleDraftMessage}
                    disabled={draftingMessage}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50 hover:opacity-90"
                    style={{ background: "var(--gradient-accent)", color: "#fff" }}
                  >
                    {draftingMessage ? (
                      <span className="inline-flex items-center gap-2">
                        <AiSpinner /> Drafting...
                      </span>
                    ) : draftedMessage ? (
                      "Redraft"
                    ) : (
                      "Draft Message"
                    )}
                  </button>
                </div>
                {messageError && (
                  <p className="text-xs" style={{ color: "#f87171" }}>{messageError}</p>
                )}
                {draftedMessage && (
                  <div className="mt-2">
                    <textarea
                      value={draftedMessage}
                      onChange={(e) => setDraftedMessage(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 text-sm"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(draftedMessage)}
                      className="text-xs font-medium mt-2 hover:underline"
                      style={{ color: "var(--color-primary-light)" }}
                    >
                      📋 Copy to Clipboard
                    </button>
                  </div>
                )}
              </div>

              <div className="mb-6">
                <p className="text-sm font-medium mb-2" style={labelStyle}>Item No. / Unit / Description / Qty</p>
                {detail.items.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {detail.items.map((p, i) => (
                      <div key={p.itemId} className="flex justify-between items-center px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-bg-secondary)" }}>
                        <span style={{ color: "var(--color-text-primary)" }}>{i + 1}. {p.itemName} ({p.unit})</span>
                        <div className="flex items-center gap-3">
                          <span style={{ color: "var(--color-text-secondary)" }}>{p.quantity} × ₱{p.unitCost.toLocaleString()}</span>
                          <button onClick={() => handleRemoveItem(p)} disabled={isLocked(detail.fulfillmentStatus)}
                            className="w-6 h-6 rounded-full font-bold disabled:opacity-30" style={{ background: "var(--color-surface)", color: "#f87171" }}>−</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isLocked(detail.fulfillmentStatus) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="col-span-full text-sm py-3 text-center" style={{ color: "var(--color-text-secondary)" }}>No inventory items available.</p>
                    ) : (
                      items.map((item) => (
                        <button key={item.id} onClick={() => handleAddItem(item)} disabled={item.stock <= 0}
                          className="p-2 text-left transition hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)", borderWidth: "var(--border-width)", borderColor: "var(--color-border)" }}>
                          <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>{item.name}</p>
                          <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>Stock: {item.stock} {item.unit || "Piece"}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-4" style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}>
                <button onClick={() => handleDeleteTicket(detail)} className="text-xs px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-md transition">
                  Delete P.O.
                </button>
                <div className="text-right">
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Total Amount</p>
                  <p className="text-lg font-bold" style={{ color: "var(--color-primary-light)" }}>
                    ₱{itemsCostOf(detail).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}