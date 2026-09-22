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

type ItemOrdered = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
};

type PaymentStatus = "Unpaid" | "Paid";
type DeliveryStatus = "Pending" | "Out for Delivery" | "Delivered" | "Cancelled";

type DeliveryTicket = {
  id: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  orderNotes: string;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  itemsOrdered: ItemOrdered[];
  deliveryFee: number;
  createdAt: string;
  updatedAt: string;
  salesRecorded?: boolean;
};

const DELIVERY_FLOW: DeliveryStatus[] = ["Pending", "Out for Delivery", "Delivered"];

const DELIVERY_COLORS: Record<DeliveryStatus, { bg: string; text: string }> = {
  Pending: { bg: "rgba(250, 204, 21, 0.15)", text: "#facc15" },
  "Out for Delivery": { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa" },
  Delivered: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
  Cancelled: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
};

const PAYMENT_COLORS: Record<PaymentStatus, { bg: string; text: string }> = {
  Unpaid: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
  Paid: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
};

const DEFAULT_COLOR = { bg: "rgba(148, 163, 184, 0.15)", text: "#94a3b8" };
const getDeliveryColors = (s: DeliveryStatus | undefined) => (s && DELIVERY_COLORS[s]) || DEFAULT_COLOR;
const getPaymentColors = (s: PaymentStatus | undefined) => (s && PAYMENT_COLORS[s]) || DEFAULT_COLOR;

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


export default function DeliveryTicketsPage() {
  const [tickets, setTickets] = useState<DeliveryTicket[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<"All" | DeliveryStatus>("All");
  const [searchText, setSearchText] = useState("");

  const [showNewForm, setShowNewForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [savingTicket, setSavingTicket] = useState(false);

  const [detail, setDetail] = useState<DeliveryTicket | null>(null);
  const [feeInput, setFeeInput] = useState("");
  const [savingFee, setSavingFee] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [businessName, setBusinessName] = useState("");
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
          if (data.enabledFeatures?.deliveryTickets === false) {
            router.push("/dashboard");
          }
        }
      });

      const ticketQuery = query(
        collection(db, "tenants", tenantId, "deliveryTickets"),
        orderBy("createdAt", "desc")
      );
      unsubTickets = onSnapshot(ticketQuery, (snapshot) => {
        setTickets(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as DeliveryTicket[]);
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
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const searchLower = searchText.toLowerCase().trim();
    return tickets.filter((t) => {
      const matchesStatus = statusFilter === "All" || t.deliveryStatus === statusFilter;
      if (!matchesStatus) return false;
      if (!searchLower) return true;
      return (
        t.customerName.toLowerCase().includes(searchLower) ||
        t.deliveryAddress.toLowerCase().includes(searchLower) ||
        t.customerPhone.toLowerCase().includes(searchLower)
      );
    });
  }, [tickets, statusFilter, searchText]);

  const resetNewForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setOrderNotes("");
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setSavingTicket(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, "tenants", uid, "deliveryTickets"), {
        customerName,
        customerPhone,
        deliveryAddress,
        orderNotes,
        paymentStatus: "Unpaid" as PaymentStatus,
        deliveryStatus: "Pending" as DeliveryStatus,
        itemsOrdered: [],
        deliveryFee: 0,
        createdAt: now,
        updatedAt: now,
        salesRecorded: false,
      });
      resetNewForm();
      setShowNewForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTicket(false);
    }
  };

  const safeAdjustStock = async (uidParam: string, itemId: string, delta: number): Promise<boolean> => {
    const ref = doc(db, "tenants", uidParam, "inventory", itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    await updateDoc(ref, { stock: increment(delta) });
    return true;
  };

  const openDetail = (ticket: DeliveryTicket) => {
    setDetail(ticket);
    setFeeInput(String(ticket.deliveryFee || 0));
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
          ticketType: "delivery",
          customerName: detail.customerName,
          statusLabel: `Delivery status: ${detail.deliveryStatus}`,
          details: detail.deliveryAddress,
          totalAmount: totalAmountOf(detail),
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

  const itemsCostOf = (ticket: DeliveryTicket) =>
    ticket.itemsOrdered.reduce((sum, p) => sum + p.unitCost * p.quantity, 0);

  const totalAmountOf = (ticket: DeliveryTicket) => itemsCostOf(ticket) + (ticket.deliveryFee || 0);

  const recordTicketAsSale = async (uidParam: string, ticket: DeliveryTicket) => {
    const total = totalAmountOf(ticket);
    await addDoc(collection(db, "tenants", uidParam, "sales"), {
      itemName: `Delivery: ${ticket.deliveryAddress} (${ticket.customerName})`,
      quantity: 1,
      price: total,
      total,
      profit: ticket.deliveryFee || 0,
      serialNumberUsed: null,
      date: new Date().toISOString(),
      source: "deliveryTicket",
      deliveryTicketId: ticket.id,
    });
  };

  const handleChangePaymentStatus = async (ticket: DeliveryTicket, newStatus: PaymentStatus) => {
    if (!uid || changingStatus) return;
    setChangingStatus(true);
    try {
      const shouldRecordSale = newStatus === "Paid" && !ticket.salesRecorded;
      if (shouldRecordSale) {
        await recordTicketAsSale(uid, ticket);
      }
      await updateDoc(doc(db, "tenants", uid, "deliveryTickets", ticket.id), {
        paymentStatus: newStatus,
        updatedAt: new Date().toISOString(),
        ...(shouldRecordSale ? { salesRecorded: true } : {}),
      });
    } catch (err) {
      console.error("Failed to change payment status:", err);
      window.alert("Something went wrong updating payment status. Please try again.");
    } finally {
      setChangingStatus(false);
    }
  };

  const handleChangeDeliveryStatus = async (ticket: DeliveryTicket, newStatus: DeliveryStatus) => {
    if (!uid || changingStatus) return;
    setChangingStatus(true);
    try {
      if (newStatus === "Cancelled" && ticket.itemsOrdered.length > 0) {
        const confirmed = window.confirm(
          "Cancelling this ticket will return all assigned items back to inventory stock. Continue?"
        );
        if (!confirmed) {
          setChangingStatus(false);
          return;
        }
        for (const it of ticket.itemsOrdered) {
          await safeAdjustStock(uid, it.itemId, it.quantity);
        }
      }
      await updateDoc(doc(db, "tenants", uid, "deliveryTickets", ticket.id), {
        deliveryStatus: newStatus,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to change delivery status:", err);
      window.alert("Something went wrong updating delivery status. Please try again.");
    } finally {
      setChangingStatus(false);
    }
  };

  const handleAddItem = async (item: InventoryItem) => {
    if (!uid || !detail) return;
    if (item.stock <= 0) return;

    const existing = detail.itemsOrdered.find((p) => p.itemId === item.id);
    const updatedItems = existing
      ? detail.itemsOrdered.map((p) => (p.itemId === item.id ? { ...p, quantity: p.quantity + 1 } : p))
      : [...detail.itemsOrdered, { itemId: item.id, itemName: item.name, quantity: 1, unitCost: item.unitCost || 0 }];

    try {
      await updateDoc(doc(db, "tenants", uid, "deliveryTickets", detail.id), {
        itemsOrdered: updatedItems,
        updatedAt: new Date().toISOString(),
      });
      await safeAdjustStock(uid, item.id, -1);
    } catch (err) {
      console.error("Failed to add item:", err);
    }
  };

  const handleRemoveItem = async (part: ItemOrdered) => {
    if (!uid || !detail) return;
    const updatedItems =
      part.quantity <= 1
        ? detail.itemsOrdered.filter((p) => p.itemId !== part.itemId)
        : detail.itemsOrdered.map((p) => (p.itemId === part.itemId ? { ...p, quantity: p.quantity - 1 } : p));

    try {
      await updateDoc(doc(db, "tenants", uid, "deliveryTickets", detail.id), {
        itemsOrdered: updatedItems,
        updatedAt: new Date().toISOString(),
      });
      await safeAdjustStock(uid, part.itemId, 1);
    } catch (err) {
      console.error("Failed to remove item:", err);
    }
  };

  const handleSaveFee = async () => {
    if (!uid || !detail) return;
    setSavingFee(true);
    try {
      await updateDoc(doc(db, "tenants", uid, "deliveryTickets", detail.id), {
        deliveryFee: Number(feeInput) || 0,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setSavingFee(false);
    }
  };

  const handleDeleteTicket = async (ticket: DeliveryTicket) => {
    if (!uid) return;
    const confirmed = window.confirm(`Delete the delivery ticket for "${ticket.customerName}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      for (const it of ticket.itemsOrdered) {
        await safeAdjustStock(uid, it.itemId, it.quantity);
      }
      await deleteDoc(doc(db, "tenants", uid, "deliveryTickets", ticket.id));
      setDetail(null);
    } catch (err) {
      console.error("Failed to delete ticket:", err);
    }
  };

  const isLocked = (status: DeliveryStatus) => status === "Cancelled" || status === "Delivered";

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <main className="flex-1 min-w-0 p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>
              Delivery Tickets
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Track customer orders from preparation to delivery
            </p>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="font-semibold px-4 py-2 text-sm hover:opacity-90"
            style={{ background: "var(--gradient-accent)", color: "#fff", borderRadius: "var(--radius-button)", boxShadow: "var(--glow-shadow)" }}
          >
            + New Ticket
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by customer name, phone, or address..."
            className="w-full px-4 py-2"
            style={inputStyle}
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {(["All", ...DELIVERY_FLOW, "Cancelled"] as const).map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s as "All" | DeliveryStatus)}
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

        {filteredTickets.length === 0 ? (
          <div className="p-8 text-center" style={{ ...cardStyle, color: "var(--color-text-secondary)" }}>
            No delivery tickets found. Click "+ New Ticket" to log a customer's order.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTickets.map((ticket) => {
              const dColors = getDeliveryColors(ticket.deliveryStatus);
              const pColors = getPaymentColors(ticket.paymentStatus);
              return (
                <button key={ticket.id} onClick={() => openDetail(ticket)} className="text-left p-4 transition hover:opacity-90" style={cardStyle}>
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{ticket.customerName}</p>
                    <div className="flex flex-col gap-1 items-end">
                      <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: dColors.bg, color: dColors.text }}>
                        {ticket.deliveryStatus || "Unknown"}
                      </span>
                      <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: pColors.bg, color: pColors.text }}>
                        {ticket.paymentStatus || "Unpaid"}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm mb-1" style={{ color: "var(--color-text-secondary)" }}>{ticket.deliveryAddress}</p>
                  <p className="text-xs mb-3 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>{ticket.orderNotes}</p>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span style={{ color: "var(--color-text-secondary)" }}>{ticket.itemsOrdered?.length || 0} item(s)</span>
                    <span className="font-semibold" style={{ color: "var(--color-primary-light)" }}>₱{totalAmountOf(ticket).toLocaleString()}</span>
                  </div>
                  {!isLocked(ticket.deliveryStatus) && (
                    <AgingBadge createdAt={ticket.createdAt} warnAfterDays={2} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {showNewForm && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form onSubmit={handleCreateTicket} className="w-full max-w-md p-6 space-y-4" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>New Delivery Ticket</p>
                <button type="button" onClick={() => setShowNewForm(false)} className="text-xl leading-none hover:opacity-70" style={{ color: "var(--color-text-secondary)" }}>×</button>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Customer Name</label>
                <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full mt-1 px-3 py-2" style={inputStyle} placeholder="Enter customer name" />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Contact Number</label>
                <div className="mt-1">
                  <PhoneNumberInput value={customerPhone} onChange={setCustomerPhone} inputStyle={inputStyle} />
                </div>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Delivery Address</label>
                <input required value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="w-full mt-1 px-3 py-2" style={inputStyle} placeholder="Enter delivery address" />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Order Notes</label>
                <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2" style={inputStyle} placeholder="Any special instructions (optional)" />
              </div>

              <button type="submit" disabled={savingTicket} className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90" style={{ background: "var(--gradient-accent)", color: "#fff", borderRadius: "var(--radius-button)", boxShadow: "var(--glow-shadow)" }}>
                {savingTicket ? "Saving..." : "Create Ticket"}
              </button>
            </form>
          </div>
        )}

        {detail && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>{detail.customerName}</h3>
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{detail.customerPhone || "No contact number"}</p>
                </div>
                <button onClick={() => setDetail(null)} className="text-xl leading-none hover:opacity-70" style={{ color: "var(--color-text-secondary)" }}>×</button>
              </div>

              <div className="mb-5 p-3" style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{detail.deliveryAddress}</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>{detail.orderNotes}</p>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium mb-2" style={labelStyle}>Payment Status</p>
                <div className="flex gap-2">
                  {(["Unpaid", "Paid"] as PaymentStatus[]).map((s) => {
                    const isActive = detail.paymentStatus === s;
                    const colors = PAYMENT_COLORS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => handleChangePaymentStatus(detail, s)}
                        disabled={changingStatus}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition disabled:opacity-40"
                        style={{ background: isActive ? colors.bg : "var(--color-bg-secondary)", color: isActive ? colors.text : "var(--color-text-secondary)" }}
                      >
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
                <p className="text-sm font-medium mb-2" style={labelStyle}>Delivery Status</p>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_FLOW.map((s) => {
                    const isActive = detail.deliveryStatus === s;
                    const colors = DELIVERY_COLORS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => handleChangeDeliveryStatus(detail, s)}
                        disabled={isLocked(detail.deliveryStatus) || changingStatus}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: isActive ? colors.bg : "var(--color-bg-secondary)", color: isActive ? colors.text : "var(--color-text-secondary)" }}
                      >
                        {s}
                      </button>
                    );
                  })}
                  {!isLocked(detail.deliveryStatus) && (
                    <button
                      onClick={() => handleChangeDeliveryStatus(detail, "Cancelled")}
                      disabled={changingStatus}
                      className="px-3 py-1.5 rounded-full text-xs font-medium hover:opacity-80 disabled:opacity-40"
                      style={{ background: DELIVERY_COLORS.Cancelled.bg, color: DELIVERY_COLORS.Cancelled.text }}
                    >
                      Cancel Ticket
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm font-medium mb-2" style={labelStyle}>Items Ordered</p>
                {detail.itemsOrdered.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {detail.itemsOrdered.map((p) => (
                      <div key={p.itemId} className="flex justify-between items-center px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-bg-secondary)" }}>
                        <span style={{ color: "var(--color-text-primary)" }}>{p.itemName}</span>
                        <div className="flex items-center gap-3">
                          <span style={{ color: "var(--color-text-secondary)" }}>{p.quantity} × ₱{p.unitCost.toLocaleString()}</span>
                          <button onClick={() => handleRemoveItem(p)} disabled={isLocked(detail.deliveryStatus)} className="w-6 h-6 rounded-full font-bold disabled:opacity-30" style={{ background: "var(--color-surface)", color: "#f87171" }}>−</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isLocked(detail.deliveryStatus) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="col-span-full text-sm py-3 text-center" style={{ color: "var(--color-text-secondary)" }}>No inventory items available.</p>
                    ) : (
                      items.map((item) => (
                        <button key={item.id} onClick={() => handleAddItem(item)} disabled={item.stock <= 0} className="p-2 text-left transition hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed" style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)", borderWidth: "var(--border-width)", borderColor: "var(--color-border)" }}>
                          <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>{item.name}</p>
                          <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>Stock: {item.stock} {item.unit || "Piece"}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>


                              {/* AI Customer Message Drafter */}
              <div className="mb-6 p-3" style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium" style={labelStyle}>🤖 Message to Customer</p>
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
                <label className="text-sm font-medium" style={labelStyle}>Delivery Fee (₱)</label>
                <div className="flex gap-2 mt-1">
                  <input type="number" step="any" value={feeInput} onChange={(e) => setFeeInput(e.target.value)} disabled={isLocked(detail.deliveryStatus)} className="flex-1 px-3 py-2 disabled:opacity-50" style={inputStyle} />
                  <button onClick={handleSaveFee} disabled={savingFee || isLocked(detail.deliveryStatus)} className="px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:opacity-90" style={{ background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-button)" }}>
                    {savingFee ? "..." : "Save"}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center p-4 mb-4" style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)", boxShadow: "var(--glow-shadow)" }}>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Items + Delivery Fee</p>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>₱{itemsCostOf(detail).toLocaleString()} + ₱{(detail.deliveryFee || 0).toLocaleString()}</p>
                </div>
                <p className="text-xl font-bold" style={{ color: "var(--color-primary-light)", fontFamily: "var(--font-heading)" }}>₱{totalAmountOf(detail).toLocaleString()}</p>
              </div>

              <button
                onClick={() => {
                  const itemLines = detail.itemsOrdered.map((p) => ({ label: `${p.itemName} × ${p.quantity}`, amount: p.unitCost * p.quantity }));
                  const linesWithFee = [...itemLines, { label: "Delivery Fee", amount: detail.deliveryFee || 0 }];
                  printReceipt({
                    businessName,
                    receiptTitle: "Delivery Receipt",
                    receiptNumber: detail.id.slice(0, 8).toUpperCase(),
                    date: new Date(),
                    customerName: detail.customerName,
                    lines: linesWithFee,
                    total: totalAmountOf(detail),
                  });
                }}
                className="w-full font-semibold py-2.5 mb-2 hover:opacity-90"
                style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)", borderRadius: "var(--radius-button)", borderWidth: "var(--border-width)", borderColor: "var(--color-border)" }}
              >
                🖨️ Print Receipt
              </button>

              <button onClick={() => handleDeleteTicket(detail)} className="w-full text-sm font-medium py-2 hover:opacity-80" style={{ color: "#f87171" }}>
                Delete Ticket
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}