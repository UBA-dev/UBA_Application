"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../lib/firebase";
import Sidebar from "../components/Sidebar";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useTheme } from "../context/ThemeContext";
import { getTheme } from "../lib/themes";

export default function SettingsPage() {
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const { themeId } = useTheme();
  const theme = getTheme(themeId);

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
              Personalize how your dashboard looks
            </p>
          </div>
        </header>

        <main className="p-6">
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
        </main>
      </div>
    </div>
  );
}