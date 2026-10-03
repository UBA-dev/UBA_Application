"use client";

import { useRef, useState } from "react";
import { compressProofImage } from "../../lib/register";

export const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  borderRadius: "var(--radius-card)",
  borderWidth: "var(--border-width)",
  borderColor: "var(--color-border)",
};

export const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  borderColor: "var(--color-border)",
  borderRadius: "var(--radius-button)",
  borderWidth: "var(--border-width)",
};

export const primaryButtonStyle: React.CSSProperties = {
  background: "var(--gradient-accent)",
  color: "#fff",
  borderRadius: "var(--radius-button)",
};

export const secondaryButtonStyle: React.CSSProperties = {
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  borderRadius: "var(--radius-button)",
  borderWidth: "var(--border-width)",
  borderColor: "var(--color-border)",
};

export const TONES = {
  green: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
  red: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
  yellow: { bg: "rgba(250, 204, 21, 0.15)", text: "#facc15" },
  blue: { bg: "rgba(96, 165, 250, 0.15)", text: "#60a5fa" },
  gray: { bg: "rgba(148, 163, 184, 0.15)", text: "var(--color-text-secondary)" },
} as const;
export type Tone = keyof typeof TONES;

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: TONES[tone].bg, color: TONES[tone].text }}
    >
      {children}
    </span>
  );
}

export function Notice({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <div
      className="px-4 py-3 text-sm leading-snug"
      style={{ background: TONES[tone].bg, color: TONES[tone].text, borderRadius: "var(--radius-button)" }}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  emphasize?: boolean;
}) {
  return (
    <div className="p-3 sm:p-4" style={{ ...cardStyle, boxShadow: emphasize ? "var(--glow-shadow)" : undefined }}>
      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </p>
      <p
        className="text-base sm:text-lg font-bold mt-1 break-all"
        style={{
          color: tone ? TONES[tone].text : "var(--color-text-primary)",
          fontFamily: "var(--font-heading)",
        }}
      >
        {value}
      </p>
      {hint && (
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5 sm:p-6 max-h-[90dvh] overflow-y-auto space-y-4`}
        style={{ ...cardStyle, boxShadow: "var(--glow-shadow)" }}
      >
        <div className="flex justify-between items-center gap-3">
          <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 -mr-2 -my-2 shrink-0 flex items-center justify-center text-2xl leading-none hover:opacity-70"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Picks a photo (camera or gallery — GCash receipts are usually screenshots)
// and hands back a compressed data URL.
export function PhotoPicker({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await compressProofImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use that photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <p className="text-sm mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label} {required && <span style={{ color: "#f87171" }}>*</span>}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Selected proof" className="w-24 h-24 object-cover rounded-lg" />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-3 py-2 text-xs font-semibold"
              style={secondaryButtonStyle}
            >
              Change photo
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="px-3 py-2 text-xs font-semibold"
              style={{ ...secondaryButtonStyle, color: "#f87171" }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full py-6 text-sm font-medium disabled:opacity-60"
          style={{ ...inputStyle, borderStyle: "dashed", borderWidth: "2px" }}
        >
          {busy ? "Preparing photo..." : "📷 Take or choose a photo"}
        </button>
      )}
      {error && (
        <p className="text-xs mt-1" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function PhotoViewer({ src, caption, onClose }: { src: string; caption?: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/90 z-60 flex flex-col items-center justify-center p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={caption || "Proof"} className="max-w-full max-h-[80dvh] object-contain rounded-lg" />
      {caption && <p className="text-sm text-white mt-3 text-center">{caption}</p>}
      <button className="mt-4 px-5 py-2 text-sm font-semibold rounded-lg bg-white text-black">Close</button>
    </div>
  );
}
