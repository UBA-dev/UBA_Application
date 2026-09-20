"use client";

// Ilagay ang file na ito sa: app/approvals/page.tsx
// Owner lang ang makakapasok dito.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";
import { canAccessPage, homeFor } from "../lib/permissions";
import Sidebar from "../components/Sidebar";

type Approval = {
  id: string;
  type: "new_item" | "price_change";
  status: "pending" | "approved" | "rejected";
  itemId?: string;
  itemName: string;
  itemData?: Record<string, any>;
  changes?: Record<string, { from: number; to: number }>;
  requestedByName: string;
  requestedAt: string;
  reviewedAt?: string;
};

// Ito lang ang mga field na papayagan nating makapasok sa inventory.
// Kahit may magdagdag ng kakaibang field sa request, hindi ito isasama.
const ITEM_FIELDS = [
  "name",
  "description",
  "category",
  "subCategory",
  "stock",
  "unit",
  "threshold",
  "unitCost",
  "sellingPrice",
  "supplierName",
  "supplierLink",
  "serialNumbers",
  "photoUrl",
  "barcode",
];

// Sa price change, ito lang ang pwedeng baguhin ng approval.
const PRICE_FIELDS = ["sellingPrice", "unitCost"];

const FIELD_LABELS: Record<string, string> = {
  sellingPrice: "Selling Price",
  unitCost: "Unit Cost",
};

const peso = (n: any) => `₱${Number(n || 0).toLocaleString()}`;

export default function ApprovalsPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let unsubApprovals = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      unsubApprovals();

      if (!user) {
        router.push("/login");
        return;
      }

      const session = await getSessionInfo(user);
      if (!canAccessPage(session.role, "/approvals")) {
        router.push(homeFor(session.role));
        return;
      }

      setUid(session.tenantId);

      const q = query(
        collection(db, "tenants", session.tenantId, "approvals"),
        orderBy("requestedAt", "desc"),
        limit(100)
      );
      unsubApprovals = onSnapshot(
        q,
        (snapshot) => {
          setApprovals(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Approval[]);
          setLoading(false);
        },
        (err) => {
          console.error("Approvals listener error:", err);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubApprovals();
    };
  }, [router]);

  const handleApprove = async (a: Approval) => {
    if (!uid) return;
    setBusyId(a.id);

    try {
      const batch = writeBatch(db);
      const approvalRef = doc(db, "tenants", uid, "approvals", a.id);

      if (a.type === "new_item" && a.itemData) {
        // Kopyahin lang ang mga pinapayagang field
        const cleanData: Record<string, any> = {};
        for (const field of ITEM_FIELDS) {
          if (a.itemData[field] !== undefined) cleanData[field] = a.itemData[field];
        }
        const newItemRef = doc(collection(db, "tenants", uid, "inventory"));
        batch.set(newItemRef, { ...cleanData, createdAt: new Date().toISOString() });
      } else if (a.type === "price_change" && a.itemId && a.changes) {
        const itemRef = doc(db, "tenants", uid, "inventory", a.itemId);
        const itemSnap = await getDoc(itemRef);

        if (!itemSnap.exists()) {
          alert("Wala na sa inventory ang item na ito, kaya hindi na ito ma-approve. I-reject na lang.");
          setBusyId(null);
          return;
        }

        const updates: Record<string, number> = {};
        for (const [field, change] of Object.entries(a.changes)) {
          const value = Number(change.to);
          if (PRICE_FIELDS.includes(field) && Number.isFinite(value) && value >= 0) {
            updates[field] = value;
          }
        }
        if (Object.keys(updates).length === 0) {
          alert("Walang valid na pagbabago sa request na ito.");
          setBusyId(null);
          return;
        }
        batch.update(itemRef, updates);
      }

      batch.update(approvalRef, {
        status: "approved",
        reviewedAt: new Date().toISOString(),
      });

      // Sabay na mase-save ang lahat, o wala talaga.
      await batch.commit();
    } catch (err) {
      console.error(err);
      alert("Hindi na-approve. Subukan ulit.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (a: Approval) => {
    if (!uid) return;
    const confirmed = window.confirm(`I-reject ang request para sa "${a.itemName}"?`);
    if (!confirmed) return;

    setBusyId(a.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "tenants", uid, "approvals", a.id), {
        status: "rejected",
        reviewedAt: new Date().toISOString(),
      });
      await batch.commit();
    } catch (err) {
      console.error(err);
      alert("Hindi na-reject. Subukan ulit.");
    } finally {
      setBusyId(null);
    }
  };

  const pending = approvals.filter((a) => a.status === "pending");
  const reviewed = approvals.filter((a) => a.status !== "pending").slice(0, 15);

  const cardStyle = {
    background: "var(--color-surface)",
    borderRadius: "var(--radius-card)",
    borderWidth: "var(--border-width)",
    borderColor: "var(--color-border)",
  } as const;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <main className="flex-1 p-6">
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
        >
          Approvals
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
          Mga bagong item at pagbabago ng presyo na hinihintay ang OK mo.
        </p>

        {loading ? (
          <p style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
        ) : pending.length === 0 ? (
          <div className="p-6 text-sm" style={{ ...cardStyle, color: "var(--color-text-secondary)" }}>
            Walang naghihintay na approval. 🎉
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map((a) => (
              <div key={a.id} className="p-4" style={cardStyle}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "var(--color-secondary)", color: "#fff" }}
                    >
                      {a.type === "new_item" ? "Bagong Item" : "Pagbabago ng Presyo"}
                    </span>
                    <p
                      className="font-semibold mt-2"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {a.itemName}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      Hiniling ni {a.requestedByName} · {new Date(a.requestedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(a)}
                      disabled={busyId === a.id}
                      className="font-semibold px-4 py-2 text-sm disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, #22c55e, #16a34a)",
                        color: "#fff",
                        borderRadius: "var(--radius-button)",
                      }}
                    >
                      {busyId === a.id ? "Sandali..." : "✅ Approve"}
                    </button>
                    <button
                      onClick={() => handleReject(a)}
                      disabled={busyId === a.id}
                      className="font-semibold px-4 py-2 text-sm disabled:opacity-50"
                      style={{
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#f87171",
                        borderRadius: "var(--radius-button)",
                      }}
                    >
                      ❌ Reject
                    </button>
                  </div>
                </div>

                {/* Detalye ng hiling */}
                <div
                  className="mt-3 text-sm grid gap-1"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {a.type === "new_item" && a.itemData && (
                    <>
                      <p>Category: {a.itemData.category || "—"}</p>
                      <p>
                        Stock: {a.itemData.stock} {a.itemData.unit || "Piece"}
                      </p>
                      <p>Unit Cost: {peso(a.itemData.unitCost)}</p>
                      <p>Selling Price: {peso(a.itemData.sellingPrice)}</p>
                      {a.itemData.supplierName && <p>Supplier: {a.itemData.supplierName}</p>}
                    </>
                  )}

                  {a.type === "price_change" &&
                    a.changes &&
                    Object.entries(a.changes).map(([field, change]) => (
                      <p key={field}>
                        {FIELD_LABELS[field] || field}: {peso(change.from)} →{" "}
                        <strong>{peso(change.to)}</strong>
                      </p>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {reviewed.length > 0 && (
          <div className="mt-8">
            <h2
              className="text-sm font-semibold mb-2"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Kamakailang na-review
            </h2>
            <div className="p-4 flex flex-col gap-2" style={cardStyle}>
              {reviewed.map((a) => (
                <div key={a.id} className="flex flex-wrap justify-between gap-2 text-sm">
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {a.itemName}{" "}
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      ({a.type === "new_item" ? "Bagong Item" : "Presyo"} · {a.requestedByName})
                    </span>
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: a.status === "approved" ? "#4ade80" : "#f87171" }}
                  >
                    {a.status === "approved" ? "Approved" : "Rejected"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}