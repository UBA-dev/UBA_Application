"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../lib/firebase";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/inventory", label: "Inventory", icon: "📦" },
  { href: "/repair-tickets", label: "Repair Tickets", icon: "🛠️" },
  { href: "/sales", label: "Sales & Expenses", icon: "💰" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

function resizeImageToBase64(file, maxSize = 160) {
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
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
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

  const handleLogoChange = async (e) => {
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
    <aside
      className={`${
        collapsed ? "w-16" : "w-64"
      } min-h-screen p-3 hidden sm:flex sm:flex-col transition-all duration-200 border-r`}
      style={{
        background: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
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

      <div className="flex flex-col items-center mb-8 px-1">
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

      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

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
              className={`flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition ${
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
            </Link>
          );
        })}
      </nav>

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
  );
}