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
import Sidebar from "../components/Sidebar";

type InventoryItem = {
  id: string;
  name: string;
  stock: number;
  unitCost: number;
  sellingPrice: number;
};

type PartUsed = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
};

type Status = "Pending" | "In Progress" | "Ready for Pickup" | "Paid" | "Cancelled";

type RepairTicket = {
  id: string;
  customerName: string;
  customerPhone: string;
  deviceInfo: string;
  issueDescription: string;
  status: Status;
  partsUsed: PartUsed[];
  laborPayment: number;
  createdAt: string;
  updatedAt: string;
  salesRecorded?: boolean;
};

const STATUS_FLOW: Status[] = ["Pending", "In Progress", "Ready for Pickup", "Paid"];

const STATUS_COLORS: Record<Status, { bg: string; text: string }> = {
  Pending: { bg: "rgba(250, 204, 21, 0.15)", text: "#facc15" },
  "In Progress": { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa" },
  "Ready for Pickup": { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc" },
  Paid: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
  Cancelled: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
};

// Fallback color so an unexpected/missing status value never crashes the UI
const DEFAULT_STATUS_COLOR = { bg: "rgba(148, 163, 184, 0.15)", text: "#94a3b8" };

const getStatusColors = (status: Status | undefined) =>
  (status && STATUS_COLORS[status]) || DEFAULT_STATUS_COLOR;

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

export default function RepairTicketsPage() {
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<"All" | Status>("All");
  const [searchText, setSearchText] = useState("");

  const [showNewForm, setShowNewForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deviceInfo, setDeviceInfo] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [savingTicket, setSavingTicket] = useState(false);

  const [detail, setDetail] = useState<RepairTicket | null>(null);
  const [laborInput, setLaborInput] = useState("");
  const [savingLabor, setSavingLabor] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [businessName, setBusinessName] = useState('');

  useEffect(() => {
    let unsubTickets = () => {};
    let unsubInv = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubTickets();
      unsubInv();

      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);

      getDoc(doc(db, "tenants", user.uid)).then((snap) => {
        if (snap.exists()) setBusinessName(snap.data().businessName || "");
      });

      const ticketQuery = query(
        collection(db, "tenants", user.uid, "repairTickets"),
        orderBy("createdAt", "desc")
      );
      unsubTickets = onSnapshot(ticketQuery, (snapshot) => {
        setTickets(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as RepairTicket[]
        );
      });

      const invQuery = query(collection(db, "tenants", user.uid, "inventory"), orderBy("name"));
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
      const matchesStatus = statusFilter === "All" || t.status === statusFilter;
      if (!matchesStatus) return false;
      if (!searchLower) return true;
      return (
        t.customerName.toLowerCase().includes(searchLower) ||
        t.deviceInfo.toLowerCase().includes(searchLower) ||
        t.customerPhone.toLowerCase().includes(searchLower)
      );
    });
  }, [tickets, statusFilter, searchText]);

  const resetNewForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setDeviceInfo("");
    setIssueDescription("");
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setSavingTicket(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, "tenants", uid, "repairTickets"), {
        customerName,
        customerPhone,
        deviceInfo,
        issueDescription,
        status: "Pending" as Status,
        partsUsed: [],
        laborPayment: 0,
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

  // Safely adjust an inventory item's stock. Checks that the document still
  // exists before calling updateDoc, since parts referenced by older repair
  // tickets can point to inventory items that were later deleted. Returns
  // true if the stock was actually adjusted, false if the item no longer
  // exists (so callers can warn the user instead of crashing).
  const safeAdjustStock = async (
    uidParam: string,
    itemId: string,
    delta: number
  ): Promise<boolean> => {
    const ref = doc(db, "tenants", uidParam, "inventory", itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.warn(`Inventory item ${itemId} no longer exists — skipping stock update.`);
      return false;
    }
    await updateDoc(ref, { stock: increment(delta) });
    return true;
  };

  const openDetail = (ticket: RepairTicket) => {
    setDetail(ticket);
    setLaborInput(String(ticket.laborPayment || 0));
  };

  const partsCostOf = (ticket: RepairTicket) =>
    ticket.partsUsed.reduce((sum, p) => sum + p.unitCost * p.quantity, 0);

  const totalCostOf = (ticket: RepairTicket) => partsCostOf(ticket) + (ticket.laborPayment || 0);

  // Records the ticket as a sale. Called automatically the moment a ticket is
  // marked "Paid". Guarded by salesRecorded so it can never double-post,
  // even if the button is clicked more than once or the write is retried.
  const recordTicketAsSale = async (uidParam: string, ticket: RepairTicket) => {
    const partsCost = partsCostOf(ticket);
    const totalCharge = partsCost + (ticket.laborPayment || 0);

    await addDoc(collection(db, "tenants", uidParam, "sales"), {
      itemName: `Repair: ${ticket.deviceInfo} (${ticket.customerName})`,
      quantity: 1,
      price: totalCharge,
      total: totalCharge,
      profit: ticket.laborPayment || 0,
      serialNumberUsed: null,
      date: new Date().toISOString(),
      source: "repairTicket",
      repairTicketId: ticket.id,
    });
  };

  const handleChangeStatus = async (ticket: RepairTicket, newStatus: Status) => {
    if (!uid || changingStatus) return;
    setChangingStatus(true);

    try {
      // Returning parts to stock when a ticket is cancelled
      if (newStatus === "Cancelled" && ticket.partsUsed.length > 0) {
        const confirmed = window.confirm(
          "Cancelling this ticket will return all assigned parts back to inventory stock. Continue?"
        );
        if (!confirmed) {
          setChangingStatus(false);
          return;
        }
        const missingParts: string[] = [];
        for (const part of ticket.partsUsed) {
          const ok = await safeAdjustStock(uid, part.itemId, part.quantity);
          if (!ok) missingParts.push(part.itemName);
        }
        if (missingParts.length > 0) {
          window.alert(
            `Note: ${missingParts.join(", ")} no longer exist(s) in inventory, so stock was not restored for ${
              missingParts.length > 1 ? "them" : "it"
            }.`
          );
        }
      }

      // Auto-list sa Sales sa sandaling naging "Paid" ang ticket.
      // salesRecorded guard = kahit ilang beses ma-trigger ito, minsan lang
      // talaga siya makakapasok sa sales collection.
      const shouldRecordSale = newStatus === "Paid" && !ticket.salesRecorded;
      if (shouldRecordSale) {
        await recordTicketAsSale(uid, ticket);
      }

      await updateDoc(doc(db, "tenants", uid, "repairTickets", ticket.id), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        ...(shouldRecordSale ? { salesRecorded: true } : {}),
      });
    } catch (err) {
      console.error("Failed to change ticket status:", err);
      window.alert("May problema sa pag-update ng ticket. Subukan ulit.");
    } finally {
      setChangingStatus(false);
    }
  };

  const handleAddPart = async (item: InventoryItem) => {
    if (!uid || !detail) return;
    if (item.stock <= 0) return;

    const existing = detail.partsUsed.find((p) => p.itemId === item.id);
    const updatedParts = existing
      ? detail.partsUsed.map((p) =>
          p.itemId === item.id ? { ...p, quantity: p.quantity + 1 } : p
        )
      : [...detail.partsUsed, { itemId: item.id, itemName: item.name, quantity: 1, unitCost: item.unitCost || 0 }];

    try {
      await updateDoc(doc(db, "tenants", uid, "repairTickets", detail.id), {
        partsUsed: updatedParts,
        updatedAt: new Date().toISOString(),
      });
      const ok = await safeAdjustStock(uid, item.id, -1);
      if (!ok) {
        window.alert(
          `"${item.name}" was removed from inventory just now, so stock could not be reduced. Please refresh.`
        );
      }
    } catch (err) {
      console.error("Failed to add part:", err);
      window.alert("May problema sa pagdagdag ng part. Subukan ulit.");
    }
  };

  const handleRemovePart = async (part: PartUsed) => {
    if (!uid || !detail) return;

    const updatedParts =
      part.quantity <= 1
        ? detail.partsUsed.filter((p) => p.itemId !== part.itemId)
        : detail.partsUsed.map((p) =>
            p.itemId === part.itemId ? { ...p, quantity: p.quantity - 1 } : p
          );

    try {
      await updateDoc(doc(db, "tenants", uid, "repairTickets", detail.id), {
        partsUsed: updatedParts,
        updatedAt: new Date().toISOString(),
      });
      const ok = await safeAdjustStock(uid, part.itemId, 1);
      if (!ok) {
        window.alert(
          `"${part.itemName}" no longer exists in inventory, so stock was not restored.`
        );
      }
    } catch (err) {
      console.error("Failed to remove part:", err);
      window.alert("May problema sa pagtanggal ng part. Subukan ulit.");
    }
  };

  const handleSaveLabor = async () => {
    if (!uid || !detail) return;
    setSavingLabor(true);
    try {
      await updateDoc(doc(db, "tenants", uid, "repairTickets", detail.id), {
        laborPayment: Number(laborInput) || 0,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setSavingLabor(false);
    }
  };

  const handleDeleteTicket = async (ticket: RepairTicket) => {
    if (!uid) return;
    const confirmed = window.confirm(
      `Delete the repair ticket for "${ticket.customerName}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const missingParts: string[] = [];
      for (const part of ticket.partsUsed) {
        const ok = await safeAdjustStock(uid, part.itemId, part.quantity);
        if (!ok) missingParts.push(part.itemName);
      }

      await deleteDoc(doc(db, "tenants", uid, "repairTickets", ticket.id));
      setDetail(null);

      if (missingParts.length > 0) {
        window.alert(
          `Note: ${missingParts.join(", ")} no longer exist(s) in inventory, so stock was not restored for ${
            missingParts.length > 1 ? "them" : "it"
          }.`
        );
      }
    } catch (err) {
      console.error("Failed to delete ticket:", err);
      window.alert("May problema sa pagbura ng ticket. Subukan ulit.");
    }
  };

  const isLocked = (status: Status) => status === "Cancelled" || status === "Paid";

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
              Repair Tickets
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Track customer repairs from drop-off to pickup
            </p>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="font-semibold px-4 py-2 text-sm hover:opacity-90"
            style={{
              background: "var(--gradient-accent)",
              color: "#fff",
              borderRadius: "var(--radius-button)",
              boxShadow: "var(--glow-shadow)",
            }}
          >
            + New Ticket
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by customer name, phone, or device..."
            className="w-full px-4 py-2"
            style={inputStyle}
          />
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(["All", ...STATUS_FLOW, "Cancelled"] as const).map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s as "All" | Status)}
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

        {/* Ticket list */}
        {filteredTickets.length === 0 ? (
          <div className="p-8 text-center" style={{ ...cardStyle, color: "var(--color-text-secondary)" }}>
            No repair tickets found. Click "+ New Ticket" to log a customer's device.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTickets.map((ticket) => {
              const colors = getStatusColors(ticket.status);
              return (
                <button
                  key={ticket.id}
                  onClick={() => openDetail(ticket)}
                  className="text-left p-4 transition hover:opacity-90"
                  style={cardStyle}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {ticket.customerName}
                    </p>
                    <span
                      className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {ticket.status || "Unknown"}
                    </span>
                  </div>
                  <p className="text-sm mb-1" style={{ color: "var(--color-text-secondary)" }}>
                    {ticket.deviceInfo}
                  </p>
                  <p className="text-xs mb-3 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
                    {ticket.issueDescription}
                  </p>
                  <div className="flex justify-between items-center text-xs">
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      {ticket.partsUsed?.length || 0} part(s)
                    </span>
                    <span className="font-semibold" style={{ color: "var(--color-primary-light)" }}>
                      ₱{totalCostOf(ticket).toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ---- NEW TICKET MODAL ---- */}
        {showNewForm && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form
              onSubmit={handleCreateTicket}
              className="w-full max-w-md p-6 space-y-4"
              style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}
            >
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  New Repair Ticket
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Customer Name</label>
                <input
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. Juan Dela Cruz"
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Contact Number</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. 09171234567"
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Device</label>
                <input
                  required
                  value={deviceInfo}
                  onChange={(e) => setDeviceInfo(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. HP Pavilion 14 Laptop"
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>Reported Issue</label>
                <textarea
                  required
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  rows={3}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. Won't turn on, no display"
                />
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
                {savingTicket ? "Saving..." : "Create Ticket"}
              </button>
            </form>
          </div>
        )}

        {/* ---- TICKET DETAIL MODAL ---- */}
        {detail && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <div
              className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
              style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3
                    className="text-lg font-bold"
                    style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
                  >
                    {detail.customerName}
                  </h3>
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    {detail.customerPhone || "No contact number"}
                  </p>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>

              <div className="mb-5 p-3" style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {detail.deviceInfo}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  {detail.issueDescription}
                </p>
              </div>

              {/* Status flow */}
              <div className="mb-6">
                <p className="text-sm font-medium mb-2" style={labelStyle}>Status</p>
                {detail.status === "Paid" && detail.salesRecorded && (
                <p className="text-xs mb-2" style={{ color: "#4ade80" }}>
                 ✓ Recorded in Sales
                </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {STATUS_FLOW.map((s) => {
                    const isActive = detail.status === s;
                    const colors = STATUS_COLORS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => handleChangeStatus(detail, s)}
                        disabled={isLocked(detail.status) || changingStatus}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: isActive ? colors.bg : "var(--color-bg-secondary)",
                          color: isActive ? colors.text : "var(--color-text-secondary)",
                          boxShadow: isActive ? `0 0 12px ${colors.bg}` : "none",
                        }}
                      >
                        {s === "Paid" ? "Mark as Paid" : s}
                      </button>
                    );
                  })}
                  {!isLocked(detail.status) && (
                    <button
                      onClick={() => handleChangeStatus(detail, "Cancelled")}
                      disabled={changingStatus}
                      className="px-3 py-1.5 rounded-full text-xs font-medium hover:opacity-80 disabled:opacity-40"
                      style={{ background: STATUS_COLORS.Cancelled.bg, color: STATUS_COLORS.Cancelled.text }}
                    >
                      Cancel Ticket
                    </button>
                  )}
                </div>
              </div>

              {/* Parts used */}
              <div className="mb-6">
                <p className="text-sm font-medium mb-2" style={labelStyle}>Parts Used</p>

                {detail.partsUsed.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {detail.partsUsed.map((p) => (
                      <div
                        key={p.itemId}
                        className="flex justify-between items-center px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-bg-secondary)" }}
                      >
                        <span style={{ color: "var(--color-text-primary)" }}>{p.itemName}</span>
                        <div className="flex items-center gap-3">
                          <span style={{ color: "var(--color-text-secondary)" }}>
                            {p.quantity} × ₱{p.unitCost.toLocaleString()}
                          </span>
                          <button
                            onClick={() => handleRemovePart(p)}
                            disabled={isLocked(detail.status)}
                            className="w-6 h-6 rounded-full font-bold disabled:opacity-30"
                            style={{ background: "var(--color-surface)", color: "#f87171" }}
                          >
                            −
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isLocked(detail.status) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="col-span-full text-sm py-3 text-center" style={{ color: "var(--color-text-secondary)" }}>
                        No inventory items available.
                      </p>
                    ) : (
                      items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleAddPart(item)}
                          disabled={item.stock <= 0}
                          className="p-2 text-left transition hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{
                            background: "var(--color-bg-secondary)",
                            borderRadius: "var(--radius-button)",
                            borderWidth: "var(--border-width)",
                            borderColor: "var(--color-border)",
                          }}
                        >
                          <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {item.name}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                            Stock: {item.stock}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Labor payment */}
              <div className="mb-6">
                <label className="text-sm font-medium" style={labelStyle}>Labor Payment (₱)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    value={laborInput}
                    onChange={(e) => setLaborInput(e.target.value)}
                    disabled={isLocked(detail.status)}
                    className="flex-1 px-3 py-2 disabled:opacity-50"
                    style={inputStyle}
                  />
                  <button
                    onClick={handleSaveLabor}
                    disabled={savingLabor || isLocked(detail.status)}
                    className="px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:opacity-90"
                    style={{
                      background: "var(--color-primary)",
                      color: "#fff",
                      borderRadius: "var(--radius-button)",
                    }}
                  >
                    {savingLabor ? "..." : "Save"}
                  </button>
                </div>
              </div>

              {/* Total cost summary */}
              <div
                className="flex justify-between items-center p-4 mb-4"
                style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)", boxShadow: "var(--glow-shadow)" }}
              >
                <div>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Parts + Labor</p>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    ₱{partsCostOf(detail).toLocaleString()} + ₱{(detail.laborPayment || 0).toLocaleString()}
                  </p>
                </div>
                <p
                  className="text-xl font-bold"
                  style={{ color: "var(--color-primary-light)", fontFamily: "var(--font-heading)" }}
                >
                  ₱{totalCostOf(detail).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => handleDeleteTicket(detail)}
                className="w-full text-sm font-medium py-2 hover:opacity-80"
                style={{ color: "#f87171" }}
              >
                Delete Ticket
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}