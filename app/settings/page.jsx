"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import Sidebar from "../components/Sidebar";
import ThemeSwitcher from "../components/ThemeSwitcher";
import GraphStyleSwitcher from "../components/GraphStyleSwitcher";
import { useTheme } from "../context/ThemeContext";
import { getTheme } from "../lib/themes";

export default function SettingsPage() {
  const [checking, setChecking] = useState(true);
  const [reorderItems, setReorderItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);

  const router = useRouter();
  const { themeId } = useTheme();
  const theme = getTheme(themeId);

  // Auth checking
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setChecking(false);
    });
    return () => unsubscribe();
  }, [router]);

  // Fetch low stock / reorder items from Firebase Firestore
  useEffect(() => {
    if (checking) return;

    const fetchReorderItems = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "inventory"));
        const lowStockList = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const stock = Number(data.stock ?? data.quantity ?? 0);
          const minStock = Number(data.minStock ?? data.minQuantity ?? 5);

          // Check if current stock hit or went below minimum threshold
          if (stock <= minStock) {
            lowStockList.push({
              id: doc.id,
              name: data.name || data.itemName || "Unnamed Item",
              category: data.category || "General",
              currentStock: stock,
              minStock: minStock,
              suggestedOrder: Math.max(minStock * 2 - stock, 10), // Auto calculate suggested order quantity
              supplier: data.supplier || "N/A",
            });
          }
        });

        setReorderItems(lowStockList);
      } catch (error) {
        console.error("Error fetching inventory reorder summary:", error);
      } finally {
        setLoadingItems(false);
      }
    };

    fetchReorderItems();
  }, [checking]);

  // Export reorder list as CSV file
  const handleDownloadCSV = () => {
    if (reorderItems.length === 0) return;

    const headers = ["Item Name", "Category", "Current Stock", "Min Threshold", "Suggested Reorder Qty", "Supplier"];
    const rows = reorderItems.map((item) => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.category.replace(/"/g, '""')}"`,
      item.currentStock,
      item.minStock,
      item.suggestedOrder,
      `"${item.supplier.replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Reorder_Summary_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Loading settings...</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ background: theme.colors.bgPrimary }}
    >
      <Sidebar />
      <div className="flex-1">
        <header
          className="px-6 py-4 flex justify-between items-center border-b"
          style={{
            background: theme.colors.bgSecondary,
            borderColor: theme.colors.border,
          }}
        >
          <div>
            <h1
              className="text-lg font-bold"
              style={{ color: theme.colors.textPrimary }}
            >
              Settings
            </h1>
            <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
              Personalize how your dashboard looks & manage inventory reorder summaries
            </p>
          </div>
        </header>

        <main className="p-6 space-y-10 max-w-4xl">
          {/* Section 1: Reorder Summary */}
          <section
            className="p-5 rounded-xl border"
            style={{
              background: theme.colors.bgSecondary,
              borderColor: theme.colors.border,
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    className="text-base font-semibold"
                    style={{ color: theme.colors.textPrimary }}
                  >
                    📦 Low Stock & Reorder Summary
                  </h2>
                  {reorderItems.length > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {reorderItems.length} Needs Action
                    </span>
                  )}
                </div>
                <p
                  className="text-xs mt-1"
                  style={{ color: theme.colors.textSecondary }}
                >
                  Quick view of items that reached minimum stock level. Download the list to order immediately.
                </p>
              </div>

              <button
                onClick={handleDownloadCSV}
                disabled={reorderItems.length === 0 || loadingItems}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 self-start sm:self-auto"
              >
                📥 Download Reorder List (.CSV)
              </button>
            </div>

            {loadingItems ? (
              <p className="text-xs py-4 text-center" style={{ color: theme.colors.textSecondary }}>
                Checking inventory levels...
              </p>
            ) : reorderItems.length === 0 ? (
              <div
                className="p-4 rounded-lg text-xs text-center font-medium"
                style={{
                  background: theme.colors.bgPrimary,
                  color: "#10B981",
                }}
              >
                ✅ All items have sufficient stock! No reorders needed right now.
              </div>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr
                      className="border-b"
                      style={{
                        borderColor: theme.colors.border,
                        color: theme.colors.textSecondary,
                      }}
                    >
                      <th className="py-2 px-3">Item Name</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3 text-center">Current Stock</th>
                      <th className="py-2 px-3 text-center">Min Threshold</th>
                      <th className="py-2 px-3 text-center">Suggested Order</th>
                      <th className="py-2 px-3">Supplier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: theme.colors.border }}>
                    {reorderItems.map((item) => (
                      <tr key={item.id} style={{ color: theme.colors.textPrimary }}>
                        <td className="py-2.5 px-3 font-medium">{item.name}</td>
                        <td className="py-2.5 px-3" style={{ color: theme.colors.textSecondary }}>
                          {item.category}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-red-500">
                          {item.currentStock}
                        </td>
                        <td className="py-2.5 px-3 text-center" style={{ color: theme.colors.textSecondary }}>
                          {item.minStock}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-blue-500">
                          +{item.suggestedOrder} pcs
                        </td>
                        <td className="py-2.5 px-3">{item.supplier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 2: Theme Switcher */}
          <section>
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: theme.colors.textPrimary }}
            >
              Choose Your Theme
            </h2>
            <p
              className="text-sm mb-5"
              style={{ color: theme.colors.textSecondary }}
            >
              Pick the look that fits your shop's vibe. Changes apply instantly across
              the whole app.
            </p>
            <ThemeSwitcher />
          </section>

          {/* Section 3: Graph Style Switcher */}
          <section>
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: theme.colors.textPrimary }}
            >
              Graph Style
            </h2>
            <p
              className="text-sm mb-5"
              style={{ color: theme.colors.textSecondary }}
            >
              Choose how your Dashboard trend chart is drawn.
            </p>
            <GraphStyleSwitcher />
          </section>
        </main>
      </div>
    </div>
  );
}