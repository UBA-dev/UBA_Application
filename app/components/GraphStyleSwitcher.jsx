"use client";

import { useTheme } from "../context/ThemeContext";
import { getTheme } from "../lib/themes";

const GRAPH_STYLES = [
  {
    id: "line",
    label: "Line",
    icon: (
      <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
        <polyline points="1,16 8,9 14,13 21,4 27,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "bar",
    label: "Bar",
    icon: (
      <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
        <rect x="2" y="10" width="5" height="8" rx="1" fill="currentColor" />
        <rect x="11.5" y="4" width="5" height="14" rx="1" fill="currentColor" />
        <rect x="21" y="13" width="5" height="5" rx="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "area",
    label: "Area",
    icon: (
      <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
        <path d="M1,16 L8,9 L14,13 L21,4 L27,8 L27,18 L1,18 Z" fill="currentColor" opacity="0.35" />
        <polyline points="1,16 8,9 14,13 21,4 27,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function GraphStyleSwitcher() {
  const { themeId, graphStyle, changeGraphStyle } = useTheme();
  const theme = getTheme(themeId);

  return (
    <div className="flex flex-wrap gap-2">
      {GRAPH_STYLES.map((style) => {
        const isActive = graphStyle === style.id;
        return (
          <button
            key={style.id}
            onClick={() => changeGraphStyle(style.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition hover:opacity-90"
            style={{
              background: isActive ? theme.colors.primary : theme.colors.surface,
              color: isActive ? "#fff" : theme.colors.textSecondary,
              boxShadow: isActive ? theme.glow : "none",
              borderWidth: isActive ? 0 : "1px",
              borderColor: theme.colors.border,
            }}
          >
            <span style={{ color: isActive ? "#fff" : theme.colors.primaryLight }}>{style.icon}</span>
            {style.label}
          </button>
        );
      })}
    </div>
  );
}