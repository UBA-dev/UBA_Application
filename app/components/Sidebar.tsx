"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { doc, getDoc, updateDoc, collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../lib/firebase";

const baseNavItems: { href: string; label: string; icon: string; disabled?: boolean; adminOnly?: boolean; featureKey?: string }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/inventory", label: "Inventory", icon: "📦" },
  { href: "/repair-tickets", label: "Repair Tickets", icon: "🛠️", featureKey: "repairTickets" },
  { href: "/delivery-tickets", label: "Delivery Tickets", icon: "🚚", featureKey: "deliveryTickets" },
  { href: "/po-tickets", label: "P.O. / Purchase Order", icon: "📋", featureKey: "poTickets" },
  { href: "/sales", label: "Sales & Expenses", icon: "💰" },
  { href: "/pos", label: "POS / Checkout", icon: "🧾" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/admin", label: "Admin", icon: "👑", adminOnly: true },
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
  const [planId, setPlanId] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("trial");
  const [enabledFeatures, setEnabledFeatures] = useState<Record<string, boolean>>({});
  const [featuresLoaded, setFeaturesLoaded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [showNotifModal, setShowNotifModal] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsAdmin(false);
        setBusinessName("");
        setLogoUrl(null);
        return;
      }
      console.log("DEBUG — user.uid:", user.uid);
      console.log("DEBUG — ADMIN_UID from env:", ADMIN_UID);
      setIsAdmin(user.uid === ADMIN_UID);
      try {
        const tenantSnap = await getDoc(doc(db, "tenants", user.uid));
        if (tenantSnap.exists()) {
          const data = tenantSnap.data();
          setBusinessName(data.businessName || "");
          setNameDraft(data.businessName || "");
          setLogoUrl(data.logoUrl || null);
          setPlanId(data.planId || null);
          setSubscriptionStatus(data.subscriptionStatus || "trial");
          setEnabledFeatures(data.enabledFeatures || {});
        }
      } catch (err) {
        console.error("Error fetching tenant data:", err);
      } finally {
        setFeaturesLoaded(true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let unsubInv = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubInv();

      if (!user) {
        setNotification(null);
        return;
      }

      const invQuery = query(collection(db, "tenants", user.uid, "inventory"), orderBy("name"));
      unsubInv = onSnapshot(
        invQuery,
        (snapshot) => {
          const lowStockItems: LowStockItem[] = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() } as any))
            .filter((i) => (i.stock ?? 0) <= (i.threshold ?? i.minStock ?? 0))
            .map((i) => {
              const limit = i.threshold ?? i.minStock ?? 0;
              return {
                id: i.id,
                name: i.name,
                stock: i.stock ?? 0,
                minStock: limit,
                suggestedOrder: Math.max(limit * 2 - (i.stock ?? 0), limit || 1),
                supplier: i.supplierName?.trim() || "N/A",
              };
            });

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
        },
        (error) => {
          console.error("Error fetching inventory notifications:", error);
        }
      );
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
    try {
      await updateDoc(doc(db, "tenants", user.uid), { businessName: trimmed });
      setBusinessName(trimmed);
    } catch (err) {
      console.error("Failed to update business name:", err);
    } finally {
      setEditingName(false);
    }
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
    try {
      await signOut(auth);
      router.push("/login");
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  const navItems = baseNavItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    // Hide feature-gated items until we've actually confirmed their state —
    // prevents a flash where all items briefly show before Firestore replies.
    if (item.featureKey && !featuresLoaded) return false;
    if (item.featureKey && enabledFeatures[item.featureKey] === false) return false;
    return true;
  });

  const planLabel: { text: string; bg: string; color: string } = (() => {
    if (subscriptionStatus === "active" && planId) {
      const labels: Record<string, string> = { basic: "BASIC", pro: "PRO", business: "BUSINESS" };
      return { text: labels[planId] || planId.toUpperCase(), bg: "rgba(74, 222, 128, 0.15)", color: "#4ade80" };
    }
    return { text: "FREE TRIAL", bg: "rgba(148, 163, 184, 0.15)", color: "var(--color-text-secondary)" };
  })();

  return (
    <>
      {/* MOBILE TOP BAR - Upgrade button sa TOP RIGHT CORNER */}
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

        <div className="flex items-center gap-1.5 max-w-[45%]">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {businessName || "My Shop"}
          </p>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: planLabel.bg, color: planLabel.color }}
          >
            {planLabel.text}
          </span>
        </div>

        {/* TOP RIGHT CORNER: Notification Icon */}
        <div className="flex items-center gap-2">
          {notification && notification.count > 0 &&  (
            <button
              onClick={() => setShowNotifModal(true)}
              className="relative text-lg"
              aria-label="Notifications"
            >
              🔔
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {notification.count}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
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

      {/* DESKTOP SIDEBAR - Upgrade button sa TOP RIGHT CORNER ng Sidebar Header */}
      <aside
        className={`${
          collapsed ? "w-16" : "w-64"
        } min-h-screen p-3 hidden sm:flex sm:flex-col transition-all duration-200 border-r relative`}
        style={{
          background: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header Section (May UPGRADE button sa Top Right) */}
        <div className="flex items-center justify-between mb-4 px-1 relative">
          {!collapsed ? (
            <div className="flex items-center justify-between w-full">
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-text-secondary)" }}
              >
                My Shop
              </p>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  className="p-1 rounded-lg transition hover:opacity-80"
                  style={{ color: "var(--color-text-secondary)" }}
                  title="Collapse sidebar"
                >
                  «
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-lg transition mx-auto hover:opacity-80"
              style={{ color: "var(--color-text-secondary)" }}
              title="Expand sidebar"
            >
              »
            </button>
          )}
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
            className={`relative rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 border transition ${
              collapsed ? "w-9 h-9" : "w-16 h-16"
            } ${!collapsed ? "hover:opacity-80 cursor-pointer" : ""}`}
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Shop logo" className="w-full h-full object-cover" />
            ) : (
              <span className={collapsed ? "text-sm" : "text-xl"}>🏪</span>
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
                  className="w-full text-sm font-semibold text-center leading-snug rounded px-1 py-1 resize-none focus:outline-none"
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
                  className="text-sm font-semibold leading-snug break-words whitespace-normal w-full hover:opacity-80"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {businessName || "Set shop name"}{" "}
                  <span style={{ color: "var(--color-text-secondary)" }}>✎</span>
                </button>
              )}
              <span
                className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: planLabel.bg, color: planLabel.color }}
              >
                {planLabel.text}
              </span>
            </div>
          )}
        </div>

        {/* Low Stock Alert Button */}
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
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : ""}
                className={`flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition ${
                  collapsed ? "justify-center" : ""
                }`}
                style={{
                  background: isActive ? "var(--color-surface)" : "transparent",
                  color: isActive ? "var(--color-primary-light)" : "var(--color-text-secondary)",
                }}
              >
                <span>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

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

      {/* Low Stock Modal */}
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
              <button onClick={() => setShowNotifModal(false)} className="text-gray-400 hover:text-white text-lg font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-400">{notification.message}</p>

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
            </div>
          </div>
        </div>
      )}

      <div className="sm:hidden h-14" />
    </>
  );
}