"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { doc, getDoc, updateDoc, collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../lib/firebase";

const navItems: { href: string; label: string; icon: string; disabled?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/inventory", label: "Inventory", icon: "📦" },
  { href: "/repair-tickets", label: "Repair Tickets", icon: "🛠️" },
  { href: "/sales", label: "Sales & Expenses", icon: "💰" },
  { href: "/pos", label: "POS / Checkout", icon: "🧾" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/admin", label: "Admin", icon: "👑" },
];

interface LowStockItem {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  suggestedOrder: number;
  supplier: string;
}

interface NotificationData {
  hasNotification: boolean;
  count: number;
  title: string;
  message: string;
  items: LowStockItem[];
}

function resizeImageToBase64(file: File, maxSize = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ADMIN_UID = process.env.NEXT_PUBLIC_ADMIN_UID;

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification states
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [showNotifModal, setShowNotifModal] = useState(false);

  // Fetch shop tenant details
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      setIsAdmin(user.uid === ADMIN_UID);
      const tenantSnap = await getDoc(doc(db, "tenants", user.uid));
      if (tenantSnap.exists()) {
        const data = tenantSnap.data();
        setBusinessName(data.businessName || "");
        setNameDraft(data.businessName || "");
        setLogoUrl(data.logoUrl || null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch low stock reorder notifications directly from Firestore (tenant-scoped)
  useEffect(() => {
    let unsubInv = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubInv();

      if (!user) {
        setNotification(null);
        return;
      }

      const invQuery = query(collection(db, "tenants", user.uid, "inventory"), orderBy("name"));
      unsubInv = onSnapshot(invQuery, (snapshot) => {
        const lowStockItems: LowStockItem[] = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((i) => (i.stock ?? 0) <= (i.threshold ?? 0))
          .map((i) => ({
            id: i.id,
            name: i.name,
            stock: i.stock ?? 0,
            minStock: i.threshold ?? 0,
            suggestedOrder: Math.max((i.threshold ?? 0) * 2 - (i.stock ?? 0), i.threshold || 1),
            supplier: i.supplierName?.trim() || "N/A",
          }));

        if (lowStockItems.length === 0) {
          setNotification(null);
          return;
        }

        setNotification({
          hasNotification: true,
          count: lowStockItems.length,
          title: "⚠️ Low Stock Alert",
          message: `${lowStockItems.length} item(s) need reordering: ${lowStockItems
            .map((i) => i.name)
            .join(", ")}.`,
          items: lowStockItems,
        });
      });
    });

    return () => {
      unsubscribeAuth();
      unsubInv();
    };
  }, []);

  const saveBusinessName = async () => {
    const user = auth.currentUser;
    if (!user || !nameDraft.trim()) {
      setNameDraft(businessName);
      setEditingName(false);
      return;
    }
    const trimmed = nameDraft.trim();
    await updateDoc(doc(db, "tenants", user.uid), { businessName: trimmed });
    setBusinessName(trimmed);
    setEditingName(false);
  };

  const handleLogoClick = () => {
    if (collapsed) return;
    fileInputRef.current?.click();
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const user = auth.currentUser;
    if (!file || !user) return;

    setUploading(true);
    setUploadError("");
    try {
      const base64 = await resizeImageToBase64(file);
      await updateDoc(doc(db, "tenants", user.uid), { logoUrl: base64 });
      setLogoUrl(base64);
    } catch (err) {
      console.error("Logo upload failed:", err);
      setUploadError("Couldn't process that image. Try a different photo.");
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  return (
    <>
      {/* Mobile top bar with hamburger — visible only below sm breakpoint */}
      <div
        className="sm:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3"
        style={{
          background: "var(--color-bg-secondary)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="text-2xl leading-none"
          style={{ color: "var(--color-text-primary)" }}
          aria-label="Open menu"
        >
          ☰
        </button>
        <p
          className="text-sm font-semibold truncate max-w-[60%]"
          style={{ color: "var(--color-text-primary)" }}
        >
          {businessName || "My Shop"}
        </p>
        {notification && notification.count > 0 ? (
          <button
            onClick={() => setShowNotifModal(true)}
            className="relative text-xl"
            aria-label="Notifications"
          >
            🔔
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {notification.count}
            </span>
          </button>
        ) : (
          <span className="w-6" />
        )}
      </div>

      {/* Mobile drawer overlay */}
      {mobileMenuOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className="relative w-72 max-w-[80vw] h-full flex flex-col p-4 overflow-y-auto"
            style={{ background: "var(--color-bg-secondary)" }}
          >
            <div className="flex justify-between items-center mb-6">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {businessName || "My Shop"}
              </p>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-2xl leading-none"
                style={{ color: "var(--color-text-secondary)" }}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>

            <nav className="space-y-1 flex-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                if (item.disabled) {
                  return (
                    <div
                      key={item.href}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm opacity-40"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium"
                    style={{
                      background: isActive ? "var(--color-surface)" : "transparent",
                      color: isActive ? "var(--color-primary-light)" : "var(--color-text-secondary)",
                    }}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {(item.href === "/settings" || item.href === "/inventory") &&
                      notification &&
                      notification.count > 0 && (
                        <span className="ml-auto bg-red-500 text-white rounded-full text-[10px] font-bold px-1.5 py-0.5">
                          {notification.count}
                        </span>
                      )}
                  </Link>
                );
              })}
            </nav>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium mt-4"
              style={{ color: "#f87171" }}
            >
              <span>🚪</span>
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      <aside
        className={`${
          collapsed ? "w-16" : "w-64"
        } min-h-screen p-3 hidden sm:flex sm:flex-col transition-all duration-200 border-r relative`}
        style={{
          background: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header & Collapse Toggle */}
        <div className="flex items-center justify-between mb-4 px-1">
          {!collapsed && (
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-text-secondary)" }}
            >
              My Shop
            </p>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg transition ml-auto hover:opacity-80"
            style={{ color: "var(--color-text-secondary)" }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        {/* Logo Section */}
        <div className="flex flex-col items-center mb-6 px-1">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleLogoChange}
            className="hidden"
          />
          <button
            onClick={handleLogoClick}
            disabled={collapsed}
            title="Click to change logo"
            className={`relative rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 border transition theme-pulse ${
              collapsed ? "w-9 h-9" : "w-16 h-16"
            } ${!collapsed ? "hover:opacity-80 cursor-pointer" : ""}`}
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
              boxShadow: logoUrl ? "var(--glow-shadow)" : "none",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Shop logo" className="w-full h-full object-cover" />
            ) : (
              <span className={collapsed ? "text-sm" : "text-xl"}>🏪</span>
            )}
            {uploading && (
              <span
                className="absolute inset-0 flex items-center justify-center text-[10px]"
                style={{ background: "var(--color-surface-glass)", color: "var(--color-text-secondary)" }}
              >
                ...
              </span>
            )}
          </button>

          {!collapsed && uploadError && (
            <p className="text-[11px] text-red-400 mt-1 text-center">{uploadError}</p>
          )}

          {!collapsed && (
            <div className="mt-2 w-full text-center px-1">
              {editingName ? (
                <textarea
                  autoFocus
                  rows={2}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveBusinessName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      saveBusinessName();
                    }
                    if (e.key === "Escape") {
                      setNameDraft(businessName);
                      setEditingName(false);
                    }
                  }}
                  className="w-full text-sm font-semibold text-center leading-snug rounded px-1 py-1 resize-none focus:outline-none focus:ring-1"
                  style={{
                    background: "var(--color-surface)",
                    color: "var(--color-text-primary)",
                    borderWidth: "1px",
                    borderColor: "var(--color-primary)",
                  }}
                />
              ) : (
                <button
                  onClick={() => setEditingName(true)}
                  title="Click to edit shop name"
                  className="text-sm font-semibold leading-snug break-words whitespace-normal w-full hover:opacity-80"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {businessName || "Set shop name"}{" "}
                  <span style={{ color: "var(--color-text-secondary)" }}>✎</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Owner Quick Alert Trigger Button */}
        {notification && notification.count > 0 && (
          <button
            onClick={() => setShowNotifModal(true)}
            className="mb-4 w-full p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 transition flex items-center justify-between text-xs font-semibold"
          >
            <span className="flex items-center gap-1.5">
              🔔 {!collapsed && "Reorder Alerts"}
            </span>
            <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold">
              {notification.count}
            </span>
          </button>
        )}

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isSettings = item.href === "/settings";
            const isInventory = item.href === "/inventory";

            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-not-allowed text-sm ${
                    collapsed ? "justify-center" : ""
                  }`}
                  style={{ color: "var(--color-text-secondary)", opacity: 0.4 }}
                  title="Coming soon"
                >
                  <span>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : ""}
                className={`relative flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition ${
                  collapsed ? "justify-center" : ""
                }`}
                style={{
                  background: isActive ? "var(--color-surface)" : "transparent",
                  color: isActive ? "var(--color-primary-light)" : "var(--color-text-secondary)",
                  boxShadow: isActive ? "var(--glow-shadow)" : "none",
                }}
              >
                <span>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}

                {/* Badge Indicator for Inventory or Settings */}
                {(isSettings || isInventory) && notification && notification.count > 0 && (
                  <span
                    className={`bg-red-500 text-white rounded-full font-bold flex items-center justify-center ${
                      collapsed
                        ? "absolute -top-1 -right-1 w-4 h-4 text-[9px]"
                        : "ml-auto px-1.5 py-0.2 text-[10px]"
                    }`}
                  >
                    {notification.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition hover:opacity-80 mb-1"
            style={{ color: "#a855f7" }}
          >
            <span>🛡️</span>
            {!collapsed && <span>Admin</span>}
          </Link>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          title={collapsed ? "Log out" : ""}
          className={`mt-auto flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition hover:opacity-80 ${
            collapsed ? "justify-center" : ""
          }`}
          style={{ color: "#f87171" }}
        >
          <span>🚪</span>
          {!collapsed && <span>Log Out</span>}
        </button>
      </aside>

      {/* Owner Reorder Notification Modal */}
      {showNotifModal && notification && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-xl p-5 shadow-2xl border space-y-4"
            style={{
              background: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <h3 className="font-bold text-base">Owner Reorder Notifications</h3>
              </div>
              <button
                onClick={() => setShowNotifModal(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-400">
              {notification.message}
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {notification.items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border text-xs flex items-center justify-between"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div>
                    <p className="font-semibold text-sm">{item.name}</p>
                    <p className="text-[11px] text-gray-400">Supplier: {item.supplier}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-400 font-bold">Stock: {item.stock} / {item.minStock}</p>
                    <p className="text-blue-400 font-semibold">Order: +{item.suggestedOrder} pcs</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNotifModal(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border"
                style={{ borderColor: "var(--color-border)" }}
              >
                Close
              </button>
              <Link
                href="/settings"
                onClick={() => setShowNotifModal(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                Open Settings & Download CSV 📥
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Spacer so page content isn't hidden behind the fixed mobile top bar */}
      <div className="sm:hidden h-14" />
    </>
  );
}