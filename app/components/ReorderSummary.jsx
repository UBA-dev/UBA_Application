"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useTheme } from "../context/ThemeContext";
import { getTheme } from "../lib/themes";

function computeSuggestedQty(stock, threshold) {
  // Restock enough to comfortably clear the low-stock zone, not just barely meet it
  const target = threshold * 2;
  return Math.max(target - stock, threshold);
}

export default function ReorderSummary() {
  const [items, setItems] = useState([]);
  const { themeId } = useTheme();
  const theme = getTheme(themeId);

   useEffect(() => {
    let unsubInv = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubInv();
      if (!user) return;

      const q = query(collection(db, "tenants", user.uid, "inventory"), orderBy("name"));
      unsubInv = onSnapshot(q, (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    });

    return () => {
      unsubscribeAuth();
      unsubInv();
    };
  }, []);

  const lowStockItems = items
    .filter((i) => i.stock <= i.threshold)
    .map((i) => ({
      ...i,
      suggestedQty: computeSuggestedQty(i.stock, i.threshold),
    }))
    .sort((a, b) => a.stock / (a.threshold || 1) - b.stock / (b.threshold || 1));

  const groupedBySupplier = lowStockItems.reduce((acc, item) => {
    const key = item.supplierName?.trim() || "No supplier listed";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const handleDownload = () => {
        const lines = [
      `REORDER SUMMARY`,
      `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      "",
    ];
    Object.entries(groupedBySupplier).forEach(([supplier, supplierItems]) => {
      lines.push(`Supplier: ${supplier}`);
      supplierItems.forEach((item) => {
        lines.push(
          `  - ${item.name} | Current stock: ${item.stock} | Order: ${item.suggestedQty} unit(s)${
            item.supplierLink ? ` | ${item.supplierLink}` : ""
          }`
        );
      });
      lines.push("");
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reorder-summary-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

    if (lowStockItems.length === 0) {
    return (
      <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
        All items are sufficiently stocked. No reorders needed at this time.
      </p>
    );
  }
  return (
    <div>
      <div className="flex justify-between items-center mb-3 gap-3">
                <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
          {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} require reordering, sorted by priority.
        </p>
        <button
          onClick={handleDownload}
          className="text-sm font-semibold px-4 py-2 hover:opacity-90 flex-shrink-0"
          style={{
            background: theme.accentGradient,
            color: "#fff",
            borderRadius: theme.radiusButton,
            boxShadow: theme.glow,
          }}
        >
          ⬇️ Download List
        </button>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedBySupplier).map(([supplier, supplierItems]) => (
          <div key={supplier}>
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: theme.colors.primaryLight }}
            >
              {supplier}
            </p>
            <div className="space-y-1.5">
              {supplierItems.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center px-3 py-2 text-sm"
                  style={{
                    background: theme.colors.bgSecondary,
                    borderRadius: theme.radiusButton,
                  }}
                >
                  <span style={{ color: theme.colors.textPrimary }}>{item.name}</span>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    <span style={{ color: theme.colors.textSecondary }}>
                      Stock: {item.stock}
                    </span>
                                        <span
                      className="font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: theme.colors.primary, color: "#fff" }}
                    >
                      Reorder {item.suggestedQty}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}