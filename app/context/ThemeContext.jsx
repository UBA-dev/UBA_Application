"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getTheme, defaultThemeId } from "../lib/themes";

const ThemeContext = createContext(null);

function applyThemeToDOM(theme) {
  const root = document.documentElement;
  root.style.setProperty("--color-bg-primary", theme.colors.bgPrimary);
  root.style.setProperty("--color-bg-secondary", theme.colors.bgSecondary);
  root.style.setProperty("--color-surface", theme.colors.surface);
  root.style.setProperty("--color-surface-glass", theme.colors.surfaceGlass);
  root.style.setProperty("--color-primary", theme.colors.primary);
  root.style.setProperty("--color-primary-light", theme.colors.primaryLight);
  root.style.setProperty("--color-primary-glow", theme.colors.primaryGlow);
  root.style.setProperty("--color-secondary", theme.colors.secondary);
  root.style.setProperty("--color-text-primary", theme.colors.textPrimary);
  root.style.setProperty("--color-text-secondary", theme.colors.textSecondary);
  root.style.setProperty("--color-border", theme.colors.border);
  root.style.setProperty("--gradient-main", theme.gradient);
  root.style.setProperty("--gradient-accent", theme.accentGradient);
  root.style.setProperty("--glow-shadow", theme.glow);
  root.style.setProperty("--font-heading", theme.fontHeading);
  root.style.setProperty("--font-body", theme.fontBody);
  root.style.setProperty("--radius-card", theme.radiusCard);
  root.style.setProperty("--radius-button", theme.radiusButton);
  root.style.setProperty("--border-width", theme.borderWidth);
  root.style.setProperty("--letter-spacing", theme.letterSpacing);
}
export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(defaultThemeId);
  const [graphStyle, setGraphStyle] = useState("line");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (!user) {
        applyThemeToDOM(getTheme(defaultThemeId));
        setLoaded(true);
        return;
      }
      const tenantSnap = await getDoc(doc(db, "tenants", user.uid));
      const tenantData = tenantSnap.exists() ? tenantSnap.data() : null;
      const theme = getTheme(tenantData?.theme || defaultThemeId);
      setThemeId(theme.id);
      setGraphStyle(tenantData?.graphStyle || "line");
      applyThemeToDOM(theme);
      setLoaded(true);
    });
    return () => unsubscribe();
  }, []);

    const changeTheme = async (newThemeId) => {
    const theme = getTheme(newThemeId);
    setThemeId(theme.id);
    applyThemeToDOM(theme);

    const user = auth.currentUser;
    if (user) {
      await updateDoc(doc(db, "tenants", user.uid), { theme: theme.id });
    }
  };

  const changeGraphStyle = async (newStyle) => {
    setGraphStyle(newStyle);
    const user = auth.currentUser;
    if (user) {
      await updateDoc(doc(db, "tenants", user.uid), { graphStyle: newStyle });
    }
  };

  return (
    <ThemeContext.Provider value={{ themeId, changeTheme, graphStyle, changeGraphStyle, loaded }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}