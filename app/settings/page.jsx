"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, collection, addDoc, deleteDoc, onSnapshot, query, orderBy, where, getDocs, updateDoc as updateDocFs } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";
import Sidebar from "../components/Sidebar";
import ThemeSwitcher from "../components/ThemeSwitcher";
import GraphStyleSwitcher from "../components/GraphStyleSwitcher";
import ReorderSummary from "../components/ReorderSummary";
import HelpSupport from "../components/HelpSupport";
import { useTheme } from "../context/ThemeContext";
import { getTheme } from "../lib/themes";
import { canAccessPage, homeFor } from "../lib/permissions";
import { authedFetch } from "../lib/authedFetch";

const SHOP_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateShopCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SHOP_CODE_CHARS[Math.floor(Math.random() * SHOP_CODE_CHARS.length)];
  }
  return code;
}

async function generateUniqueShopCode() {
  const res = await authedFetch("/api/generate-shop-code", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not generate a shop code.");
  return data.shopCode;
}


async function revokeStaffSession(staffId) {
  const res = await authedFetch("/api/revoke-staff-session", {
    method: "POST",
    body: JSON.stringify({ staffId }),
  });
  if (!res.ok) throw new Error("Could not revoke staff session.");
}



const ROLE_LABELS = { secretary: "Secretary", cashier: "Cashier" };

const TOGGLEABLE_FEATURES = [
  { key: "repairTickets", label: "Repair Tickets", description: "Track customer repairs from drop-off to pickup." },
  { key: "deliveryTickets", label: "Delivery Tickets", description: "Track customer orders from preparation to delivery." },
  { key: "poTickets", label: "P.O. / Purchase Orders", description: "Track purchase orders from buyers, item by item." },
];

export default function SettingsPage() {
  const [checking, setChecking] = useState(true);
  const [uid, setUid] = useState(null);
  const [enabledFeatures, setEnabledFeatures] = useState({});
  const [savingFeature, setSavingFeature] = useState(null);
  const [shopCode, setShopCode] = useState("");
  const [staffList, setStaffList] = useState([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffUsername, setNewStaffUsername] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("cashier");
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [editStaffName, setEditStaffName] = useState("");
  const [editStaffUsername, setEditStaffUsername] = useState("");
  const [editStaffRole, setEditStaffRole] = useState("cashier");
  const [editStaffNewPin, setEditStaffNewPin] = useState("");
  const [savingStaffEdit, setSavingStaffEdit] = useState(false);
  const [editStaffError, setEditStaffError] = useState("");
  const [deletingStaffId, setDeletingStaffId] = useState(null);
  const router = useRouter();
  const { themeId } = useTheme();
  const theme = getTheme(themeId);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
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

      try {
        const snap = await getDoc(doc(db, "tenants", tenantId));
        if (snap.exists()) {
          setEnabledFeatures(snap.data().enabledFeatures || {});

          // Backfill: accounts created before Shop Code existed won't have
          // one saved yet. Generate and persist it the first time the
          // Owner lands on Settings, so every business ends up with a code.
          let code = snap.data().shopCode;
          if (!code && !session.isStaff) {
            code = await generateUniqueShopCode();
            await updateDoc(doc(db, "tenants", tenantId), { shopCode: code });
          }
          setShopCode(code || "");
        }
      } catch (err) {
        console.error("Failed to load feature settings:", err);
      }

      const staffQuery = query(collection(db, "tenants", tenantId, "staff"), orderBy("createdAt", "desc"));
      onSnapshot(staffQuery, (snapshot) => {
        setStaffList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      setChecking(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!uid) return;
    setSavingStaff(true);
    setStaffError("");
    try {
      const res = await authedFetch("/api/create-staff", {
        method: "POST",
        body: JSON.stringify({
          name: newStaffName,
          username: newStaffUsername,
          pin: newStaffPin,
          role: newStaffRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStaffError(data.error || "Couldn't create staff account.");
        return;
      }
      setNewStaffName("");
      setNewStaffUsername("");
      setNewStaffPin("");
      setNewStaffRole("cashier");
      setShowAddStaff(false);
    } catch (err) {
      console.error(err);
      setStaffError("Something went wrong. Please try again.");
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleStaffActive = async (staff) => {
    if (!uid) return;
    const willDeactivate = staff.active !== false;
    await updateDocFs(doc(db, "tenants", uid, "staff", staff.id), { active: staff.active === false });
    // Kapag dine-deactivate, bawiin agad ang session niya
    if (willDeactivate) {
      try {
        await revokeStaffSession(staff.id);
      } catch (err) {
        console.error(err);
      }
    }
  };


  const handleRegenerateShopCode = async () => {
    if (!uid) return;
    const confirmed = window.confirm(
      "Generate a new Shop Code? The current code will stop working immediately — you'll need to share the new one with your staff before they can log in again."
    );
    if (!confirmed) return;

    setRegeneratingCode(true);
    try {
      const newCode = await generateUniqueShopCode();
      await updateDoc(doc(db, "tenants", uid), { shopCode: newCode });
      setShopCode(newCode);
    } catch (err) {
      console.error("Failed to regenerate shop code:", err);
      window.alert("Something went wrong. Please try again.");
    } finally {
      setRegeneratingCode(false);
    }
  };



    const openEditStaff = (staff) => {
    setEditingStaff(staff);
    setEditStaffName(staff.name);
    setEditStaffUsername(staff.username);
    setEditStaffRole(staff.role);
    setEditStaffNewPin("");
    setEditStaffError("");
  };

  const handleSaveStaffEdit = async (e) => {
    e.preventDefault();
    if (!uid || !editingStaff) return;
    setSavingStaffEdit(true);
    setEditStaffError("");
    try {
      const res = await authedFetch("/api/update-staff", {
        method: "POST",
        body: JSON.stringify({
          staffId: editingStaff.id,
          name: editStaffName,
          username: editStaffUsername,
          role: editStaffRole,
          newPin: editStaffNewPin || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditStaffError(data.error || "Couldn't update this staff account.");
        return;
      }
      setEditingStaff(null);
    } catch (err) {
      console.error(err);
      setEditStaffError("Something went wrong. Please try again.");
    } finally {
      setSavingStaffEdit(false);
    }
  };

  const handleDeleteStaff = async (staff) => {
    if (!uid) return;
    const confirmed = window.confirm(
      `Remove "${staff.name}" (@${staff.username}) permanently? They will no longer be able to log in. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingStaffId(staff.id);
    try {
      await revokeStaffSession(staff.id);
      await deleteDoc(doc(db, "tenants", uid, "staff", staff.id));
    } catch (err) {
      console.error("Failed to delete staff:", err);
      window.alert("Something went wrong removing this staff account. Please try again.");
    } finally {
      setDeletingStaffId(null);
    }
  };




  // Defaults to enabled (true) when the field hasn't been set yet, so
  // existing tenants don't suddenly lose access to features they already use.
  const isFeatureEnabled = (key) => enabledFeatures[key] !== false;

  const handleToggleFeature = async (key) => {
    if (!uid) return;
    const nextValue = !isFeatureEnabled(key);
    setSavingFeature(key);
    try {
      const updated = { ...enabledFeatures, [key]: nextValue };
      await updateDoc(doc(db, "tenants", uid), { enabledFeatures: updated });
      setEnabledFeatures(updated);
    } catch (err) {
      console.error("Failed to update feature setting:", err);
    } finally {
      setSavingFeature(null);
    }
  };

  if (checking) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: theme.colors.bgPrimary }}
      >
        <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
          Loading settings...
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ background: theme.colors.bgPrimary }}
    >
      <Sidebar />
      <div className="flex-1 min-w-0">
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
              Personalize how your dashboard looks
            </p>
          </div>
        </header>

        <main className="p-6 space-y-10 max-w-2xl">
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

          <section>
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: theme.colors.textPrimary }}
            >
              Staff Management
            </h2>
            <p
              className="text-sm mb-3"
              style={{ color: theme.colors.textSecondary }}
            >
              Give your Secretary and Cashiers their own login — no need to share your account.
              Share this Shop Code with them along with their username and PIN:
            </p>
            <div
              className="flex items-center justify-between p-4 mb-4"
              style={{ background: theme.colors.bgSecondary, borderRadius: "12px" }}
            >
              <span
                className="text-lg font-mono font-bold tracking-widest"
                style={{ color: theme.colors.primary }}
              >
                {shopCode || "..."}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shopCode);
                    setCopyFeedback(true);
                    setTimeout(() => setCopyFeedback(false), 1500);
                  }}
                  className="text-xs font-medium hover:underline"
                  style={{ color: theme.colors.textSecondary }}
                >
                  {copyFeedback ? "✓ Copied!" : "📋 Copy"}
                </button>
                <button
                  onClick={handleRegenerateShopCode}
                  disabled={regeneratingCode}
                  className="text-xs font-medium hover:underline disabled:opacity-50"
                  style={{ color: theme.colors.textSecondary }}
                >
                  {regeneratingCode ? "..." : "🔄 Regenerate"}
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {staffList.length === 0 ? (
                <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
                  No staff accounts yet.
                </p>
              ) : (
                staffList.map((staff) => (
                  <div
                    key={staff.id}
                    className="flex items-center justify-between p-3"
                    style={{
                      background: theme.colors.bgSecondary,
                      borderRadius: "12px",
                      opacity: staff.active === false ? 0.5 : 1,
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: theme.colors.textPrimary }}>
                        {staff.name}{" "}
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full ml-1"
                          style={{ background: theme.colors.primary, color: "#fff" }}
                        >
                          {ROLE_LABELS[staff.role] || staff.role}
                        </span>
                      </p>
                      <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
                        @{staff.username} {staff.active === false && "· Deactivated"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={() => openEditStaff(staff)}
                        className="text-xs font-medium hover:underline"
                        style={{ color: theme.colors.primaryLight }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStaffActive(staff)}
                        className="text-xs font-medium hover:underline"
                        style={{ color: staff.active === false ? "#4ade80" : "#facc15" }}
                      >
                        {staff.active === false ? "Reactivate" : "Deactivate"}
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(staff)}
                        disabled={deletingStaffId === staff.id}
                        className="text-xs font-medium hover:underline disabled:opacity-50"
                        style={{ color: "#f87171" }}
                      >
                        {deletingStaffId === staff.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {!showAddStaff ? (
              <button
                onClick={() => setShowAddStaff(true)}
                className="text-sm font-semibold px-4 py-2 hover:opacity-90"
                style={{
                  background: theme.accentGradient,
                  color: "#fff",
                  borderRadius: theme.radiusButton,
                }}
              >
                + Add Staff
              </button>
            ) : (
              <form
                onSubmit={handleAddStaff}
                autoComplete="off"
                className="p-4 space-y-3"
                style={{ background: theme.colors.bgSecondary, borderRadius: "12px" }}
              >
                <input
                  required
                  autoComplete="off"
                  name="staff-full-name"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 text-sm"
                  style={{
                    background: theme.colors.surface,
                    color: theme.colors.textPrimary,
                    borderRadius: theme.radiusButton,
                    borderWidth: "1px",
                    borderColor: theme.colors.border,
                  }}
                />
                <input
                  required
                  autoComplete="off"
                  name="staff-login-username"
                  value={newStaffUsername}
                  onChange={(e) => setNewStaffUsername(e.target.value)}
                  placeholder="Username (no spaces)"
                  className="w-full px-3 py-2 text-sm"
                  style={{
                    background: theme.colors.surface,
                    color: theme.colors.textPrimary,
                    borderRadius: theme.radiusButton,
                    borderWidth: "1px",
                    borderColor: theme.colors.border,
                  }}
                />
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  name="staff-access-pin"
                  inputMode="numeric"
                  value={newStaffPin}
                  onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="4-6 digit PIN"
                  className="w-full px-3 py-2 text-sm"
                  style={{
                    background: theme.colors.surface,
                    color: theme.colors.textPrimary,
                    borderRadius: theme.radiusButton,
                    borderWidth: "1px",
                    borderColor: theme.colors.border,
                  }}
                />
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm"
                  style={{
                    background: theme.colors.surface,
                    color: theme.colors.textPrimary,
                    borderRadius: theme.radiusButton,
                    borderWidth: "1px",
                    borderColor: theme.colors.border,
                  }}
                >
                  <option value="cashier">Cashier</option>
                  <option value="secretary">Secretary</option>
                </select>

                {staffError && (
                  <p className="text-xs" style={{ color: "#f87171" }}>{staffError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddStaff(false)}
                    className="flex-1 text-sm font-medium py-2"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingStaff}
                    className="flex-1 text-sm font-semibold py-2 disabled:opacity-50"
                    style={{ background: theme.accentGradient, color: "#fff", borderRadius: theme.radiusButton }}
                  >
                    {savingStaff ? "Creating..." : "Create Staff Account"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: theme.colors.textPrimary }}
            >
              Modules
            </h2>
            <p
              className="text-sm mb-5"
              style={{ color: theme.colors.textSecondary }}
            >
              Turn off features you don't use to simplify your navigation. You can turn
              them back on anytime — nothing is deleted.
            </p>
            <div className="space-y-3">
              {TOGGLEABLE_FEATURES.map((feature) => {
                const enabled = isFeatureEnabled(feature.key);
                return (
                  <div
                    key={feature.key}
                    className="flex items-center justify-between p-4"
                    style={{
                      background: theme.colors.bgSecondary,
                      borderRadius: "12px",
                      borderWidth: "1px",
                      borderColor: theme.colors.border,
                    }}
                  >
                    <div className="pr-4">
                      <p className="text-sm font-medium" style={{ color: theme.colors.textPrimary }}>
                        {feature.label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: theme.colors.textSecondary }}>
                        {feature.description}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleFeature(feature.key)}
                      disabled={savingFeature === feature.key}
                      className="relative flex-shrink-0 w-12 h-7 rounded-full transition disabled:opacity-50"
                      style={{ background: enabled ? "#4ade80" : "rgba(148, 163, 184, 0.3)" }}
                      aria-label={`Toggle ${feature.label}`}
                    >
                      <span
                        className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all"
                        style={{ left: enabled ? "24px" : "4px" }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

         
            <section>
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: theme.colors.textPrimary }}
            >
              Reorder Summary
            </h2>
            <p
              className="text-sm mb-5"
              style={{ color: theme.colors.textSecondary }}
            >
              UBA automatically identifies items that need restocking, organized by supplier.
            </p>
            <ReorderSummary />
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: theme.colors.textPrimary }}
            >
              Help &amp; Support
            </h2>
            <p
              className="text-sm mb-5"
              style={{ color: theme.colors.textSecondary }}
            >
              Have a question? Read the FAQ, chat with UBA support, or message the developer directly.
            </p>
            <HelpSupport />
          </section>
        </main>

        {editingStaff && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form
              onSubmit={handleSaveStaffEdit}
              autoComplete="off"
              className="w-full max-w-md p-6 space-y-3"
              style={{
                background: theme.colors.bgSecondary,
                borderRadius: "16px",
                borderWidth: "1px",
                borderColor: theme.colors.border,
              }}
            >
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm font-semibold" style={{ color: theme.colors.textPrimary }}>
                  Edit Staff
                </p>
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: theme.colors.textSecondary }}
                >
                  ×
                </button>
              </div>

              <input
                required
                autoComplete="off"
                name="edit-staff-name"
                value={editStaffName}
                onChange={(e) => setEditStaffName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 text-sm"
                style={{
                  background: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  borderRadius: theme.radiusButton,
                  borderWidth: "1px",
                  borderColor: theme.colors.border,
                }}
              />
              <input
                required
                autoComplete="off"
                name="edit-staff-username"
                value={editStaffUsername}
                onChange={(e) => setEditStaffUsername(e.target.value)}
                placeholder="Username"
                className="w-full px-3 py-2 text-sm"
                style={{
                  background: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  borderRadius: theme.radiusButton,
                  borderWidth: "1px",
                  borderColor: theme.colors.border,
                }}
              />
              <select
                value={editStaffRole}
                onChange={(e) => setEditStaffRole(e.target.value)}
                className="w-full px-3 py-2 text-sm"
                style={{
                  background: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  borderRadius: theme.radiusButton,
                  borderWidth: "1px",
                  borderColor: theme.colors.border,
                }}
              >
                <option value="cashier">Cashier</option>
                <option value="secretary">Secretary</option>
              </select>
              <div>
                <input
                  type="password"
                  autoComplete="new-password"
                  name="edit-staff-new-pin"
                  inputMode="numeric"
                  value={editStaffNewPin}
                  onChange={(e) => setEditStaffNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="New PIN (leave blank to keep current)"
                  className="w-full px-3 py-2 text-sm"
                  style={{
                    background: theme.colors.surface,
                    color: theme.colors.textPrimary,
                    borderRadius: theme.radiusButton,
                    borderWidth: "1px",
                    borderColor: theme.colors.border,
                  }}
                />
                <p className="text-[11px] mt-1" style={{ color: theme.colors.textSecondary }}>
                  Only fill this in if you want to reset their PIN.
                </p>
              </div>

              {editStaffError && (
                <p className="text-xs" style={{ color: "#f87171" }}>{editStaffError}</p>
              )}

              <button
                type="submit"
                disabled={savingStaffEdit}
                className="w-full text-sm font-semibold py-2.5 disabled:opacity-50"
                style={{ background: theme.accentGradient, color: "#fff", borderRadius: theme.radiusButton }}
              >
                {savingStaffEdit ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}