"use client";

import { themeList } from "../lib/themes";
import { useTheme } from "../context/ThemeContext";

export default function ThemeSwitcher() {
  const { themeId, changeTheme } = useTheme();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {themeList().map((theme) => {
        const isActive = themeId === theme.id;
        return (
          <button
            key={theme.id}
            onClick={() => changeTheme(theme.id)}
            className={`relative rounded-2xl p-5 text-left overflow-hidden transition-all duration-200 border-2 ${
              isActive ? "scale-[1.02]" : "hover:scale-[1.02]"
            }`}
            style={{
              background: theme.gradient,
              borderColor: isActive ? theme.colors.primary : "transparent",
              boxShadow: isActive ? theme.glow : "none",
            }}
          >
            {isActive && (
              <span
                className="absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: theme.colors.primary, color: theme.colors.bgPrimary }}
              >
                ACTIVE
              </span>
            )}

            <div
              className="w-10 h-10 rounded-full mb-4"
              style={{ background: theme.accentGradient, boxShadow: theme.glow }}
            />

            <h3 className="font-bold text-base mb-1" style={{ color: theme.colors.textPrimary }}>
              {theme.name}
            </h3>
            <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
              {theme.tagline}
            </p>

            <div className="flex gap-1.5 mt-4">
              <span className="w-5 h-5 rounded-full" style={{ background: theme.colors.primary }} />
              <span className="w-5 h-5 rounded-full" style={{ background: theme.colors.secondary }} />
              <span className="w-5 h-5 rounded-full" style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}