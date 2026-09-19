"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";
import { useTheme } from "../context/ThemeContext";
import { getTheme } from "../lib/themes";

function computeSuggestedQty(stock, threshold) {
  const target = threshold * 2;
  return Math.max(target - stock, threshold);
}

// Detects which kind of link this is so we know HOW to open it —
// messaging apps can be pre-filled with a message, plain websites cannot.
function detectLinkType(link) {
  if (!link) return null;
  const lower = link.toLowerCase();
  if (lower.includes("wa.me") || lower.includes("whatsapp.com")) return "whatsapp";
  if (lower.includes("m.me") || lower.includes("messenger.com") || lower.includes("facebook.com")) return "messenger";
  if (lower.includes("viber.com") || lower.startsWith("viber:")) return "viber";
  return "website";
}

function buildOrderMessage(itemsToOrder) {
  const lines = itemsToOrder.map((i) => `- ${i.name} x${i.suggestedQty}`);
  return `Hi! I'd like to order the following:\n${lines.join("\n")}\n\nThank you!`;
}

// Builds the actual URL to open — for messaging apps, appends a pre-filled
// message. For regular websites, we can't inject text, so it opens as-is.
function buildOrderUrl(link, itemsToOrder) {
  const type = detectLinkType(link);
  const message = buildOrderMessage(itemsToOrder);
  const encoded = encodeURIComponent(message);

  if (type === "whatsapp") {
    // wa.me links accept a `text` query param that pre-fills the chat box
    const base = link.includes("?") ? `${link}&text=${encoded}` : `${link}?text=${encoded}`;
    return base;
  }
  if (type === "messenger") {
    // Messenger/Facebook links don't support pre-filled text via URL —
    // opens the chat, message still needs to be pasted manually.
    return link;
  }
  if (type === "viber") {
    return link;
  }
  return link;
}

export default function ReorderSummary() {
  const [items, setItems] = useState([]);
  const [orderingKey, setOrderingKey] = useState(null);
  const { themeId } = useTheme();
  const theme = getTheme(themeId);

  useEffect(() => {
    let unsubInv = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      unsubInv();
      if (!user) return;

      const session = await getSessionInfo(user);
      const q = query(collection(db, "tenants", session.tenantId, "inventory"), orderBy("name"));
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

  // Opens the message-composer if we can pre-fill it, otherwise copies the
  // order text to the clipboard so the owner can paste it manually.
  const handleOrderNow = async (item) => {
    if (!item.supplierLink) {
      window.alert(`No supplier link saved for "${item.name}". Add one in Inventory first.`);
      return;
    }
    const url = buildOrderUrl(item.supplierLink, [item]);
    const type = detectLinkType(item.supplierLink);

    if (type === "messenger" || type === "viber") {
      try {
        await navigator.clipboard.writeText(buildOrderMessage([item]));
        window.alert("Order message copied to clipboard — paste it once the chat opens.");
      } catch {
        // Clipboard can fail silently in some browsers — not critical, order link still opens.
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOrderAllFromSupplier = async (supplierItems) => {
    const withLinks = supplierItems.filter((i) => i.supplierLink);
    if (withLinks.length === 0) {
      window.alert("None of these items have a supplier link saved yet.");
      return;
    }

    // Use the first available link for this supplier group — assumes items
    // from the same supplier share the same ordering channel.
    const primaryLink = withLinks[0].supplierLink;
    const url = buildOrderUrl(primaryLink, withLinks);
    const type = detectLinkType(primaryLink);

    if (type === "messenger" || type === "viber") {
      try {
        await navigator.clipboard.writeText(buildOrderMessage(withLinks));
        window.alert("Combined order message copied to clipboard — paste it once the chat opens.");
      } catch {
        // Non-critical — order link still opens below.
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

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

      <div className="space-y-5">
        {Object.entries(groupedBySupplier).map(([supplier, supplierItems]) => {
          const hasAnyLink = supplierItems.some((i) => i.supplierLink);
          return (
            <div key={supplier}>
              <div className="flex justify-between items-center mb-2 gap-2">
                <p
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: theme.colors.primaryLight }}
                >
                  {supplier}
                </p>
                {hasAnyLink && supplierItems.length > 1 && (
                  <button
                    onClick={() => handleOrderAllFromSupplier(supplierItems)}
                    className="text-xs font-semibold px-3 py-1.5 hover:opacity-90 flex-shrink-0"
                    style={{
                      background: theme.colors.surface,
                      color: theme.colors.primaryLight,
                      borderRadius: theme.radiusButton,
                      borderWidth: "1px",
                      borderColor: theme.colors.primary,
                    }}
                  >
                    🛒 Order All from {supplier}
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {supplierItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center px-3 py-2 text-sm gap-2"
                    style={{
                      background: theme.colors.bgSecondary,
                      borderRadius: theme.radiusButton,
                    }}
                  >
                    <span style={{ color: theme.colors.textPrimary }} className="truncate">
                      {item.name}
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span style={{ color: theme.colors.textSecondary }} className="hidden sm:inline">
                        Stock: {item.stock}
                      </span>
                      <span
                        className="font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: theme.colors.primary, color: "#fff" }}
                      >
                        Reorder {item.suggestedQty}
                      </span>
                      {item.supplierLink && (
                        <button
                          onClick={() => handleOrderNow(item)}
                          className="text-xs font-semibold px-2.5 py-1 hover:opacity-90"
                          style={{
                            background: theme.accentGradient,
                            color: "#fff",
                            borderRadius: theme.radiusButton,
                          }}
                        >
                          Order Now
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}