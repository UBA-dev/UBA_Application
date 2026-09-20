"use client";

// Ilagay ang file na ito sa: app/components/InstallButton.tsx
// (palitan ang lumang laman)

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "desktop";

// ─────────────────────────────────────────────────────────────
// Hinuhuli natin ang "beforeinstallprompt" sa labas ng component.
// Ang browser ay pinapadala ito nang isang beses lang, at kadalasan
// bago pa lumabas ang button. Kung sa loob ng component natin ito
// hinuli, madalas na hindi na aabot, kaya nawawala ang button.
// ─────────────────────────────────────────────────────────────
let savedPrompt: InstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    savedPrompt = e as InstallPromptEvent;
    subscribers.forEach((notify) => notify());
  });
  window.addEventListener("appinstalled", () => {
    savedPrompt = null;
    subscribers.forEach((notify) => notify());
  });
}

const HELP_STEPS: Record<Platform, { title: string; steps: string[] }> = {
  ios: {
    title: "Install UBA on your iPhone or iPad",
    steps: [
      "Open this page in Safari.",
      "Tap the Share button at the bottom of the screen.",
      "Scroll down and tap Add to Home Screen.",
      "Tap Add. UBA now opens like any other app.",
    ],
  },
  android: {
    title: "Install UBA on your Android phone",
    steps: [
      "Open this page in Chrome.",
      "Tap the menu button (three dots) at the top right.",
      "Tap Install app or Add to Home screen.",
      "Tap Install. UBA now opens like any other app.",
    ],
  },
  desktop: {
    title: "Install UBA on your computer",
    steps: [
      "Open this page in Chrome or Edge.",
      "Click the install icon at the right end of the address bar.",
      "Click Install. UBA now opens in its own window.",
    ],
  },
};

type Props = {
  variant?: "header" | "hero";
};

export default function InstallButton({ variant = "hero" }: Props) {
  const [, refresh] = useState(0);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    // Naka-install na ba? Kung oo, hindi na natin ipapakita ang button.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setInstalled(isStandalone);

    const ua = navigator.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(isIOS ? "ios" : /android/i.test(ua) ? "android" : "desktop");

    const update = () => refresh((n) => n + 1);
    const handleInstalled = () => setInstalled(true);

    subscribers.add(update);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      subscribers.delete(update);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  // Isara ang instructions gamit ang Escape key
  useEffect(() => {
    if (!showHelp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHelp]);

  const handleClick = async () => {
    if (savedPrompt) {
      // May native na install prompt ang browser: gamitin ito
      await savedPrompt.prompt();
      await savedPrompt.userChoice;
      savedPrompt = null;
      refresh((n) => n + 1);
    } else {
      // Wala (halimbawa: iPhone Safari): ipakita ang mga hakbang
      setShowHelp(true);
    }
  };

  if (installed) return null;

  const sizeClasses =
    variant === "hero" ? "px-6 py-3 text-sm" : "px-3.5 py-2 text-sm";
  const help = HELP_STEPS[platform];

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${sizeClasses} inline-flex items-center gap-2 rounded-lg font-semibold transition-colors hover:bg-white/5`}
        style={{
          border: "1px solid var(--lp-line, #2C2438)",
          color: "var(--lp-text, #F5F1FF)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <path d="M12 8v6" />
          <path d="M9.5 11.5 12 14l2.5-2.5" />
        </svg>
        Install app
      </button>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => setShowHelp(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-help-title"
            className="w-full max-w-md p-6"
            style={{
              background: "var(--lp-surface, #1C1626)",
              border: "1px solid var(--lp-line, #2C2438)",
              borderRadius: "16px",
              color: "var(--lp-text, #F5F1FF)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="install-help-title" className="text-lg font-semibold">
                {help.title}
              </h2>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                aria-label="Close"
                className="text-2xl leading-none px-1"
                style={{ color: "var(--lp-muted, #B8AFD1)" }}
              >
                ×
              </button>
            </div>

            <ol
              className="mt-4 space-y-3 text-sm list-decimal pl-5"
              style={{ color: "var(--lp-muted, #B8AFD1)" }}
            >
              {help.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: "var(--lp-primary, #7C3AED)" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}