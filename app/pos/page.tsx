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
  increment,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import Sidebar from "../components/Sidebar";
import { printReceipt } from "../lib/receipt";

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  stock: number;
  unitCost: number;
  sellingPrice: number;
};

type BundleComponent = { itemId: string; itemName: string; quantity: number };
type Bundle = {
  id: string;
  name: string;
  category: string;
  components: BundleComponent[];
  price: number;
};

type CartLine =
  | { lineId: string; kind: "item"; refId: string; name: string; unitPrice: number; unitCost: number; quantity: number; maxStock: number }
  | { lineId: string; kind: "bundle"; refId: string; name: string; unitPrice: number; quantity: number; components: BundleComponent[]; maxBundleStock: number };

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  borderRadius: "var(--radius-card)",
  borderWidth: "var(--border-width)",
  borderColor: "var(--color-border)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  borderColor: "var(--color-border)",
  borderRadius: "var(--radius-button)",
  borderWidth: "var(--border-width)",
};

export default function PosPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const router = useRouter();

  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cashReceived, setCashReceived] = useState("");
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [receiptLines, setReceiptLines] = useState<CartLine[] | null>(null);
  const [receiptChange, setReceiptChange] = useState(0);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let unsubInv = () => {};
    let unsubBundles = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubInv();
      unsubBundles();

      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);

      getDoc(doc(db, "tenants", user.uid)).then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setBusinessName(data.businessName || "");
          setLogoUrl(data.logoUrl || null);
        }
      });

      const invQuery = query(collection(db, "tenants", user.uid, "inventory"), orderBy("name"));
      unsubInv = onSnapshot(invQuery, (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as InventoryItem[]);
      });

      const bundleQuery = query(collection(db, "tenants", user.uid, "bundles"), orderBy("name"));
      unsubBundles = onSnapshot(bundleQuery, (snapshot) => {
        setBundles(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Bundle[]);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubInv();
      unsubBundles();
    };
  }, [router]);

  const categories = useMemo(() => {
    const all = [...items.map((i) => i.category), ...bundles.map((b) => b.category)];
    return ["All", ...Array.from(new Set(all.filter(Boolean))).sort()];
  }, [items, bundles]);

  const filteredProducts = useMemo(() => {
    const searchLower = searchText.toLowerCase().trim();
    const itemCards = items
      .filter((i) => selectedCategory === "All" || i.category === selectedCategory)
      .filter((i) => !searchLower || i.name.toLowerCase().includes(searchLower))
      .map((i) => ({ kind: "item" as const, data: i }));
    const bundleCards = bundles
      .filter((b) => selectedCategory === "All" || b.category === selectedCategory)
      .filter((b) => !searchLower || b.name.toLowerCase().includes(searchLower))
      .map((b) => ({ kind: "bundle" as const, data: b }));
    return [...itemCards, ...bundleCards];
  }, [items, bundles, selectedCategory, searchText]);

  // Cash-in-hand quantity available per underlying inventory item, accounting for
  // both direct item lines AND bundle component consumption already in the cart.
  const stockRemaining = useMemo(() => {
    const remaining = new Map(items.map((i) => [i.id, i.stock]));
    cart.forEach((line) => {
      if (line.kind === "item") {
        remaining.set(line.refId, (remaining.get(line.refId) || 0) - line.quantity);
      } else {
        line.components.forEach((c) => {
          remaining.set(c.itemId, (remaining.get(c.itemId) || 0) - c.quantity * line.quantity);
        });
      }
    });
    return remaining;
  }, [items, cart]);

  const addItemToCart = (item: InventoryItem) => {
    setErrorMessage("");
    const existing = cart.find((l) => l.kind === "item" && l.refId === item.id);
    const currentRemaining = stockRemaining.get(item.id) ?? item.stock;
    if (currentRemaining <= 0) {
      setErrorMessage(`No more stock available for "${item.name}".`);
      return;
    }
    if (existing) {
      setCart(cart.map((l) => (l.lineId === existing.lineId ? { ...l, quantity: l.quantity + 1 } : l)));
    } else {
      setCart([
        ...cart,
        {
          lineId: `item-${item.id}`,
          kind: "item",
          refId: item.id,
          name: item.name,
          unitPrice: item.sellingPrice,
          unitCost: item.unitCost || 0,
          quantity: 1,
          maxStock: item.stock,
        },
      ]);
    }
  };

  const addBundleToCart = (bundle: Bundle) => {
    setErrorMessage("");
    // Check every component has enough remaining stock for one more bundle unit
    const insufficient = bundle.components.find((c) => (stockRemaining.get(c.itemId) ?? 0) < c.quantity);
    if (insufficient) {
      setErrorMessage(`Not enough stock of "${insufficient.itemName}" for this bundle.`);
      return;
    }
    const existing = cart.find((l) => l.kind === "bundle" && l.refId === bundle.id);
    if (existing) {
      setCart(cart.map((l) => (l.lineId === existing.lineId ? { ...l, quantity: l.quantity + 1 } : l)));
    } else {
      setCart([
        ...cart,
        {
          lineId: `bundle-${bundle.id}`,
          kind: "bundle",
          refId: bundle.id,
          name: bundle.name,
          unitPrice: bundle.price,
          quantity: 1,
          components: bundle.components,
          maxBundleStock: 0,
        },
      ]);
    }
  };

  const updateQuantity = (lineId: string, delta: number) => {
    setErrorMessage("");
    setCart((prev) => {
      const line = prev.find((l) => l.lineId === lineId);
      if (!line) return prev;
      const newQty = line.quantity + delta;
      if (newQty <= 0) return prev.filter((l) => l.lineId !== lineId);
      return prev.map((l) => (l.lineId === lineId ? { ...l, quantity: newQty } : l));
    });
  };

  const removeLine = (lineId: string) => {
    setCart(cart.filter((l) => l.lineId !== lineId));
  };

  const cartTotal = useMemo(() => cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0), [cart]);
  const change = Number(cashReceived || 0) - cartTotal;

  const handleCompleteSale = async () => {
    if (!uid || cart.length === 0) return;
    if (Number(cashReceived) < cartTotal) {
      setErrorMessage("Cash received is less than the total amount due.");
      return;
    }

    setProcessing(true);
    setErrorMessage("");

    try {
      for (const line of cart) {
        if (line.kind === "item") {
          const total = line.unitPrice * line.quantity;
          const profit = total - line.unitCost * line.quantity;
          await addDoc(collection(db, "tenants", uid, "sales"), {
            itemName: line.name,
            quantity: line.quantity,
            price: line.unitPrice,
            total,
            profit,
            serialNumberUsed: null,
            date: new Date().toISOString(),
          });
          await updateDoc(doc(db, "tenants", uid, "inventory", line.refId), {
            stock: increment(-line.quantity),
          });
        } else {
          let totalCost = 0;
          for (const comp of line.components) {
            const invItem = items.find((i) => i.id === comp.itemId);
            totalCost += (invItem?.unitCost || 0) * comp.quantity * line.quantity;
          }
          const total = line.unitPrice * line.quantity;
          const profit = total - totalCost;

          await addDoc(collection(db, "tenants", uid, "sales"), {
            itemName: `${line.name} (Bundle)`,
            quantity: line.quantity,
            price: line.unitPrice,
            total,
            profit,
            serialNumberUsed: null,
            date: new Date().toISOString(),
          });

          for (const comp of line.components) {
            await updateDoc(doc(db, "tenants", uid, "inventory", comp.itemId), {
              stock: increment(-comp.quantity * line.quantity),
            });
          }
        }
      }

      setReceiptLines(cart);
      setReceiptChange(change);
      setCart([]);
      setCashReceived("");
    } catch (err) {
      console.error(err);
      setErrorMessage("Something went wrong while completing the sale. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <main className="flex-1 p-6 flex flex-col lg:flex-row gap-6">
        {/* Product picker */}
        <div className="flex-1">
          <h1
            className="text-xl font-bold mb-1"
            style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
          >
            Point of Sale
          </h1>
          <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
            Tap items to add them to the cart
          </p>

          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search products..."
            className="w-full px-4 py-2 mb-3"
            style={inputStyle}
          />

          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition"
                  style={{
                    background: isActive ? "var(--color-primary)" : "var(--color-surface)",
                    color: isActive ? "#fff" : "var(--color-text-secondary)",
                    borderWidth: isActive ? 0 : "var(--border-width)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredProducts.map((p) => {
              if (p.kind === "item") {
                const remaining = stockRemaining.get(p.data.id) ?? p.data.stock;
                const outOfStock = remaining <= 0;
                return (
                  <button
                    key={`item-${p.data.id}`}
                    onClick={() => addItemToCart(p.data)}
                    disabled={outOfStock}
                    className="p-3 text-left transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={cardStyle}
                  >
                    <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {p.data.name}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                      Stock: {remaining}
                    </p>
                    <p className="text-sm font-semibold mt-1" style={{ color: "var(--color-primary-light)" }}>
                      ₱{p.data.sellingPrice.toLocaleString()}
                    </p>
                  </button>
                );
              }
              return (
                <button
                  key={`bundle-${p.data.id}`}
                  onClick={() => addBundleToCart(p.data)}
                  className="p-3 text-left transition hover:opacity-90"
                  style={{ ...cardStyle, background: "var(--color-surface-glass)" }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {p.data.name}{" "}
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--color-secondary)", color: "#fff" }}
                    >
                      Bundle
                    </span>
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    {p.data.components.length} parts
                  </p>
                  <p className="text-sm font-semibold mt-1" style={{ color: "var(--color-primary-light)" }}>
                    ₱{p.data.price.toLocaleString()}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cart / Checkout panel */}
        <div className="w-full lg:w-96 flex-shrink-0">
          <div className="p-4 sticky top-6" style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}>
            <p
              className="text-sm font-semibold mb-3"
              style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
            >
              🛒 Cart
            </p>

            {cart.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "var(--color-text-secondary)" }}>
                No items in cart yet
              </p>
            ) : (
              <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
                {cart.map((line) => (
                  <div
                    key={line.lineId}
                    className="flex justify-between items-center px-2 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-bg-secondary)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ color: "var(--color-text-primary)" }}>
                        {line.name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        ₱{line.unitPrice.toLocaleString()} × {line.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => updateQuantity(line.lineId, -1)}
                        className="w-6 h-6 rounded-full font-bold"
                        style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}
                      >
                        −
                      </button>
                      <span className="w-5 text-center" style={{ color: "var(--color-text-primary)" }}>
                        {line.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(line.lineId, 1)}
                        className="w-6 h-6 rounded-full font-bold"
                        style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeLine(line.lineId)}
                        className="ml-1 text-xs"
                        style={{ color: "#f87171" }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div
              className="flex justify-between items-center py-3 mb-3"
              style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}
            >
              <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Total
              </span>
              <span
                className="text-xl font-bold"
                style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
              >
                ₱{cartTotal.toLocaleString()}
              </span>
            </div>

            <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Cash Received (₱)
            </label>
            <input
              type="number"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              className="w-full mt-1 mb-3 px-3 py-2"
              style={inputStyle}
              placeholder="0"
            />

            <div
              className="flex justify-between items-center px-4 py-3 mb-4"
              style={{
                background: change >= 0 ? "var(--gradient-accent)" : "rgba(239, 68, 68, 0.15)",
                borderRadius: "var(--radius-button)",
              }}
            >
                <span
                className="text-sm font-medium"
                style={{ color: change >= 0 ? "#fff" : "#f87171" }}
              >
                {change >= 0 ? "Change" : "Insufficient"}
              </span>
              <span
                className="text-lg font-bold"
                style={{ color: change >= 0 ? "#fff" : "#f87171", fontFamily: "var(--font-heading)" }}
              >
                ₱{Math.abs(change).toLocaleString()}
              </span>
            </div>

            {errorMessage && (
              <p
                className="text-sm p-2 rounded-lg mb-3"
                style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.1)" }}
              >
                {errorMessage}
              </p>
            )}

            <button
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || processing}
              className="w-full font-semibold py-3 disabled:opacity-50 hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#fff",
                borderRadius: "var(--radius-button)",
              }}
            >
              {processing ? "Processing..." : "✓ Complete Sale"}
            </button>
          </div>
        </div>

        {/* Receipt confirmation */}
        {receiptLines && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div
              className="w-full max-w-sm p-6"
              style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}
            >
              <p
                className="text-lg font-bold mb-1 text-center"
                style={{ color: "#4ade80", fontFamily: "var(--font-heading)" }}
              >
                ✓ Sale Complete
              </p>
              <p className="text-xs text-center mb-4" style={{ color: "var(--color-text-secondary)" }}>
                {new Date().toLocaleString()}
              </p>

              <div className="space-y-1 mb-4">
                {receiptLines.map((line) => (
                  <div key={line.lineId} className="flex justify-between text-sm">
                    <span style={{ color: "var(--color-text-primary)" }}>
                      {line.name} × {line.quantity}
                    </span>
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      ₱{(line.unitPrice * line.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="flex justify-between items-center py-2 mb-4"
                style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}
              >
                <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Change
                </span>
                <span className="text-lg font-bold" style={{ color: "var(--color-primary-light)" }}>
                  ₱{receiptChange.toLocaleString()}
                </span>
              </div>

                <button
                onClick={() => {
                  const total = receiptLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
                  printReceipt({
                    businessName,
                    logoUrl,
                    receiptTitle: "Sales Receipt",
                    date: new Date(),
                    lines: receiptLines.map((l) => ({
                      label: `${l.name} × ${l.quantity}`,
                      amount: l.unitPrice * l.quantity,
                    })),
                    total,
                    cashReceived: total + receiptChange,
                    change: receiptChange,
                  });
                }}
                className="w-full font-semibold py-2.5 mb-2 hover:opacity-90"
                style={{
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-text-primary)",
                  borderRadius: "var(--radius-button)",
                  borderWidth: "var(--border-width)",
                  borderColor: "var(--color-border)",
                }}
              >
                🖨️ Print Receipt
              </button>

              <button
                onClick={() => setReceiptLines(null)}
                className="w-full font-semibold py-2.5 hover:opacity-90"
                style={{
                  background: "var(--gradient-accent)",
                  color: "#fff",
                  borderRadius: "var(--radius-button)",
                }}
              >
                New Transaction
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}