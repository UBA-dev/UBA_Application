"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import Sidebar from "../components/Sidebar";
import ThemeSwitcher from "../components/ThemeSwitcher";
import GraphStyleSwitcher from "../components/GraphStyleSwitcher";
import ReorderSummary from "../components/ReorderSummary";
import HelpSupport from "../components/HelpSupport";
import { useTheme } from "../context/ThemeContext";
import { getTheme } from "../lib/themes";

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
  const router = useRouter();
  const { themeId } = useTheme();
  const theme = getTheme(themeId);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(db, "tenants", user.uid));
        if (snap.exists()) {
          setEnabledFeatures(snap.data().enabledFeatures || {});
        }
      } catch (err) {
        console.error("Failed to load feature settings:", err);
      }
      setChecking(false);
    });
    return () => unsubscribe();
  }, [router]);

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
              May tanong? Basahin ang FAQ, mag-chat sa AI support, o direktang i-message ang developer.
            </p>
            <HelpSupport />
          </section>
        </main>
      </div>
    </div>
  );
}