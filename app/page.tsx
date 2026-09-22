"use client";

// Ilagay ang file na ito sa: app/page.tsx
// (palitan ang buong lumang laman)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { getSessionInfo } from "./lib/staffAuth";
import { PLANS, PLAN_IDS, peso } from "./lib/plans";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import InstallButton from "./components/InstallButton";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
});

const PAGE_VARS = {
  "--lp-bg": "#120E1A",
  "--lp-surface": "#1C1626",
  "--lp-line": "#2C2438",
  "--lp-primary": "#7C3AED",
  "--lp-lavender": "#C4B5FD",
  "--lp-warm": "#FBBF77",
  "--lp-text": "#F5F1FF",
  "--lp-muted": "#B8AFD1",
} as React.CSSProperties;

const comparison = [
  {
    before: "The power or internet cuts out, and so does your ability to sell.",
    after: "The POS keeps recording sales offline and syncs when you reconnect.",
  },
  {
    before: "Stock is counted by hand, with mistakes that cost you money.",
    after: "Stock goes down with every sale, and you get alerts before you run out.",
  },
  {
    before: "You can't tell what is profitable and what isn't.",
    after: "A UBA analyst reviews your sales, expenses, and profit every month.",
  },
  {
    before: "Repair jobs and deliveries are scattered across notebooks and chat threads.",
    after: "Repairs, deliveries, and purchase orders live in one app.",
  },
];

const roles = [
  { role: "Owner", pos: "Full", inventory: "Add, edit, delete", sales: "Full access" },
  { role: "Secretary", pos: "Full", inventory: "Add, with your approval", sales: "View sales, add expenses" },
  { role: "Cashier", pos: "Full", inventory: "View only", sales: "No access" },
];

const moreFeatures = [
  {
    title: "UBA Business Analyst",
    body: "Monthly breakdowns of your sales, expenses, and profit, with specific suggestions based on your shop's real numbers.",
  },
  {
    title: "Stock alerts",
    body: "Get warned before an item runs out, not after a customer walks away empty-handed.",
  },
  {
    title: "Repairs, deliveries, and purchase orders",
    body: "Track every job, delivery, and order from one dashboard instead of juggling notebooks and group chats.",
  },
];

const steps = [
  { title: "Create your account", body: "It takes a few minutes. No technical background needed." },
  { title: "Add your products", body: "Set up prices, stock levels, and categories once." },
  { title: "Start selling", body: "Open the POS and ring up sales, online or offline." },
];

// Pricing/taglines come straight from lib/plans.js — the single source of
// truth also used by the Pricing and Admin pages — so this section can never
// drift out of sync with the real prices again.
const plans = PLAN_IDS.map((id) => {
  const plan = PLANS[id as keyof typeof PLANS];
  return {
    id,
    name: plan.name,
    price: peso(plan.monthly),
    tagline: plan.tagline,
    featured: id === "pro",
  };
});

const faqs = [
  {
    q: "Does UBA really work without internet?",
    a: "Yes. The POS keeps recording sales on your device during a brownout or dead zone, then syncs everything automatically when you're back online.",
  },
  {
    q: "Can my staff have their own logins?",
    a: "Yes. Add a secretary or cashier from Settings. They sign in with your Shop Code, their username, and a PIN, and they only see what their role allows.",
  },
  {
    q: "Can I install UBA on my phone?",
    a: "Yes. UBA installs like an app on Android, iPhone, and desktop, with no app store needed. Tap Install app at the top of this page.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. You can create an account and start without a credit card.",
  },
  {
    q: "Is my data safe if my phone breaks?",
    a: "Every record is backed up to the cloud automatically, so signing in on another device brings your shop back.",
  },
];

function OfflineDemo() {
  const [mode, setMode] = useState<"offline" | "online">("offline");
  const isOffline = mode === "offline";

  return (
    <div className="mx-auto w-full max-w-sm">
      <div
        className="p-5"
        style={{
          background: "var(--lp-surface)",
          border: "1px solid var(--lp-line)",
          borderRadius: "16px",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 pb-4"
          style={{ borderBottom: "1px dashed var(--lp-line)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-fraunces)" }}>
              Sales receipt
            </p>
            <p className="text-xs" style={{ color: "var(--lp-muted)" }}>
              Rung up by Ana, Cashier
            </p>
          </div>

          <div
            role="group"
            aria-label="Connection status"
            className="inline-flex p-0.5 rounded-full"
            style={{ background: "var(--lp-bg)", border: "1px solid var(--lp-line)" }}
          >
            {(["offline", "online"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className="px-3 py-1 text-xs font-medium rounded-full"
                style={{
                  background: mode === m ? "var(--lp-primary)" : "transparent",
                  color: mode === m ? "#fff" : "var(--lp-muted)",
                }}
              >
                {m === "offline" ? "Offline" : "Online"}
              </button>
            ))}
          </div>
        </div>

        <div className="py-4 space-y-2.5 text-sm" style={{ fontFamily: "var(--font-geist-mono)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--lp-muted)" }}>Prepaid load × 1</span>
            <span>₱20.00</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--lp-muted)" }}>Snacks × 3</span>
            <span>₱45.00</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--lp-muted)" }}>Soft drinks × 2</span>
            <span>₱60.00</span>
          </div>
        </div>

        <div
          className="pt-4 flex justify-between items-center"
          style={{ borderTop: "1px dashed var(--lp-line)", fontFamily: "var(--font-geist-mono)" }}
        >
          <span className="text-sm" style={{ color: "var(--lp-muted)" }}>Total</span>
          <span className="text-xl font-semibold" style={{ color: "var(--lp-warm)" }}>₱125.00</span>
        </div>

        <div
          className="mt-4 flex items-start gap-2 text-xs leading-snug"
          aria-live="polite"
          style={{ color: "var(--lp-muted)" }}
        >
          <span
            className="mt-1 inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: isOffline ? "var(--lp-warm)" : "#4ade80" }}
          />
          <span>
            {isOffline
              ? "Saved on this phone. It will sync when you're back online."
              : "Synced to the cloud. Your stock is up to date."}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-center" style={{ color: "var(--lp-muted)" }}>
        Try the switch. This is what your cashier sees during a brownout.
      </p>
    </div>
  );
}

export default function RootPage() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsLoggedIn(false);
        setCheckingAuth(false);
        return;
      }

      setIsLoggedIn(true);

      const session = await getSessionInfo(user);

      if (session.isStaff) {
        // Staff accounts have no email and never go through onboarding.
        // Route them straight in based on their role.
        router.push(session.role === "cashier" ? "/pos" : "/dashboard");
        return;
      }

      await user.reload();
      if (!auth.currentUser?.emailVerified) {
        router.push("/verify-email");
        return;
      }

      const tenantDoc = await getDoc(doc(db, "tenants", user.uid));
      if (tenantDoc.exists()) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Naka-login na: ire-redirect na siya, kaya loading screen lang ang ipapakita.
  // Ang bisita na hindi naka-login ay nakikita agad ang landing page.
  if (isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#120E1A" }}>
        <p className="text-sm" style={{ color: "#B8AFD1" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div
      className={`${fraunces.variable} lp min-h-screen`}
      style={{ ...PAGE_VARS, background: "var(--lp-bg)", color: "var(--lp-text)" }}
    >
      <style>{`
        .lp { font-family: var(--font-inter), system-ui, sans-serif; }
        .lp section[id] { scroll-margin-top: 88px; }
        .lp a:focus-visible,
        .lp button:focus-visible,
        .lp summary:focus-visible {
          outline: 2px solid var(--lp-lavender);
          outline-offset: 2px;
        }
        .lp-primary { background: var(--lp-primary); color: #fff; }
        .lp-primary:hover { background: #6D28D9; }
        .lp-ghost { border: 1px solid var(--lp-line); color: var(--lp-text); }
        .lp-ghost:hover { background: rgba(255, 255, 255, 0.05); }
        .lp-link:hover { color: var(--lp-text); }
        .lp details > summary { list-style: none; cursor: pointer; }
        .lp details > summary::-webkit-details-marker { display: none; }
        .lp details[open] .lp-chevron { transform: rotate(180deg); }
        @media (prefers-reduced-motion: no-preference) {
          html { scroll-behavior: smooth; }
          .lp-primary, .lp-ghost, .lp-link, .lp-chevron { transition: background-color .15s ease, color .15s ease, transform .15s ease; }
        }
      `}</style>

      {/* ───────── Header ───────── */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md"
        style={{ background: "rgba(18, 14, 26, 0.9)", borderBottom: "1px solid var(--lp-line)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="UBA home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-fraunces)" }}>
              UBA
            </span>
          </Link>

          <nav
            className="hidden md:flex items-center gap-8 text-sm"
            style={{ color: "var(--lp-muted)" }}
            aria-label="Main"
          >
            <a href="#features" className="lp-link">Features</a>
            <a href="#how-it-works" className="lp-link">How it works</a>
            <a href="#pricing" className="lp-link">Pricing</a>
            <a href="#faq" className="lp-link">FAQ</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <InstallButton variant="header" />
            </div>
            <Link href="/login" className="lp-ghost px-3.5 py-2 rounded-lg text-sm font-semibold">
              Log in
            </Link>
            <Link href="/signup" className="lp-primary px-3.5 py-2 rounded-lg text-sm font-semibold">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-14 pb-20 lg:pt-20 lg:pb-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
        <div>
          <h1
            className="text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.08] font-semibold"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Keep selling. Even when the power doesn't.
          </h1>
          <p className="mt-6 text-lg leading-relaxed max-w-xl" style={{ color: "var(--lp-muted)" }}>
            UBA is a point-of-sale and business management app for shop owners and repair
            businesses. It keeps working through brownouts and dead zones, then syncs everything
            once you're back online.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="lp-primary px-6 py-3 rounded-lg text-sm font-semibold">
              Get started free
            </Link>
            <InstallButton variant="hero" />
          </div>

          <p className="mt-5 text-sm" style={{ color: "var(--lp-muted)" }}>
            No credit card needed. Works on Android, iPhone, and desktop.
          </p>
        </div>

        <OfflineDemo />
      </section>

      {/* ───────── Before / after ───────── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 lg:py-24">
        <h2 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-fraunces)" }}>
          What changes with UBA
        </h2>
        <p className="mt-3 max-w-xl text-base" style={{ color: "var(--lp-muted)" }}>
          You already know the daily problems of running a shop. Here is how each one gets handled.
        </p>

        <div
          className="mt-10 overflow-hidden"
          style={{ border: "1px solid var(--lp-line)", borderRadius: "14px" }}
        >
          <div
            className="hidden md:grid md:grid-cols-2 gap-10 px-6 py-3 text-sm font-semibold"
            style={{ background: "var(--lp-surface)" }}
          >
            <span style={{ color: "var(--lp-muted)" }}>Without UBA</span>
            <span style={{ color: "var(--lp-lavender)" }}>With UBA</span>
          </div>

          {comparison.map((row) => (
            <div
              key={row.before}
              className="grid md:grid-cols-2 gap-3 md:gap-10 px-6 py-5"
              style={{ borderTop: "1px solid var(--lp-line)" }}
            >
              <p className="text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>
                <span className="md:hidden block text-xs font-semibold mb-1">Without UBA</span>
                {row.before}
              </p>
              <p className="text-sm leading-relaxed">
                <span className="md:hidden block text-xs font-semibold mb-1" style={{ color: "var(--lp-lavender)" }}>
                  With UBA
                </span>
                {row.after}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section id="features" className="max-w-6xl mx-auto px-5 sm:px-6 py-16 lg:py-24">
        <h2 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-fraunces)" }}>
          Built for how shops actually run
        </h2>

        <div className="mt-10 grid lg:grid-cols-12 gap-5">
          <div
            className="lg:col-span-5 p-7"
            style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-primary)", borderRadius: "14px" }}
          >
            <h3 className="text-lg font-semibold">Keeps selling when the power doesn't</h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>
              Brownouts and dead zones don't have to mean lost sales. The POS keeps working offline
              and syncs automatically once you're back online. Every sale prints a proper receipt,
              and every record is backed up to the cloud.
            </p>
          </div>

          <div
            className="lg:col-span-7 p-7 min-w-0"
            style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-line)", borderRadius: "14px" }}
          >
            <h3 className="text-lg font-semibold">Staff logins with limits you set</h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>
              Add a secretary or cashier in minutes. They sign in with your Shop Code and a PIN, and
              only see what their role allows. New items and price changes from your secretary wait
              for your approval.
            </p>

            {/* Small phones: stacked cards instead of a cramped 4-column table */}
            <div className="mt-5 sm:hidden space-y-2.5">
              {roles.map((r) => (
                <div
                  key={r.role}
                  className="p-3"
                  style={{ border: "1px solid var(--lp-line)", borderRadius: "10px" }}
                >
                  <p className="text-sm font-semibold">{r.role}</p>
                  <div className="mt-1.5 text-xs space-y-1" style={{ color: "var(--lp-muted)" }}>
                    <p>
                      <span style={{ color: "var(--lp-lavender)" }}>POS:</span> {r.pos}
                    </p>
                    <p>
                      <span style={{ color: "var(--lp-lavender)" }}>Inventory:</span> {r.inventory}
                    </p>
                    <p>
                      <span style={{ color: "var(--lp-lavender)" }}>Sales and expenses:</span> {r.sales}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tablets and up: full table */}
            <div className="mt-5 hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[460px]">
                <thead>
                  <tr style={{ color: "var(--lp-muted)" }}>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">POS</th>
                    <th className="py-2 pr-4 font-medium">Inventory</th>
                    <th className="py-2 font-medium">Sales and expenses</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.role} style={{ borderTop: "1px solid var(--lp-line)" }}>
                      <td className="py-2.5 pr-4 font-semibold">{r.role}</td>
                      <td className="py-2.5 pr-4" style={{ color: "var(--lp-muted)" }}>{r.pos}</td>
                      <td className="py-2.5 pr-4" style={{ color: "var(--lp-muted)" }}>{r.inventory}</td>
                      <td className="py-2.5" style={{ color: "var(--lp-muted)" }}>{r.sales}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-5 grid md:grid-cols-3">
          {moreFeatures.map((f, i) => (
            <div
              key={f.title}
              className={`py-6 md:py-2 md:px-7 ${i === 0 ? "md:pl-0" : "md:border-l"} ${i > 0 ? "border-t md:border-t-0" : ""}`}
              style={{ borderColor: "var(--lp-line)" }}
            >
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-5 sm:px-6 py-16 lg:py-24">
        <h2 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-fraunces)" }}>
          Get started in three steps
        </h2>
        <ol className="mt-10 grid sm:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold mb-4"
                style={{ border: "1px solid var(--lp-primary)", color: "var(--lp-lavender)" }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className="text-base font-semibold mb-1.5">{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ───────── Pricing ───────── */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 sm:px-6 py-16 lg:py-24">
        <h2 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-fraunces)" }}>
          Simple pricing
        </h2>
        <p className="mt-3 text-base" style={{ color: "var(--lp-muted)" }}>
          Pick the plan that fits your business today. Switch anytime as you grow.
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div
              key={p.name}
              className="p-6 flex flex-col"
              style={{
                background: "var(--lp-surface)",
                border: p.featured ? "1px solid var(--lp-primary)" : "1px solid var(--lp-line)",
                borderRadius: "14px",
              }}
            >
              <h3 className="text-base font-semibold">{p.name}</h3>
              <p className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-geist-mono)" }}>
                {p.price}
                <span className="text-sm font-normal" style={{ color: "var(--lp-muted)" }}> /month</span>
              </p>
              <p className="mt-2 mb-6 text-sm flex-1" style={{ color: "var(--lp-muted)" }}>{p.tagline}</p>
              <Link
                href="/signup"
                className={`${p.featured ? "lp-primary" : "lp-ghost"} block text-center text-sm font-semibold py-2.5 rounded-lg`}
              >
                Choose {p.name}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-6 text-sm" style={{ color: "var(--lp-muted)" }}>
          Pay yearly and save 25%. See full plan details on the{" "}
          <Link href="/pricing" className="lp-link underline">
            pricing page
          </Link>
          .
        </p>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="max-w-3xl mx-auto px-5 sm:px-6 py-16 lg:py-24">
        <h2 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-fraunces)" }}>
          Questions shop owners ask
        </h2>
        <div className="mt-8" style={{ borderTop: "1px solid var(--lp-line)" }}>
          {faqs.map((f) => (
            <details key={f.q} style={{ borderBottom: "1px solid var(--lp-line)" }}>
              <summary className="flex items-center justify-between gap-4 py-5 text-base font-medium">
                {f.q}
                <svg
                  className="lp-chevron shrink-0"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ color: "var(--lp-muted)" }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <p className="pb-5 text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 pb-20 lg:pb-28">
        <div
          className="px-6 sm:px-10 py-12 sm:py-14"
          style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-line)", borderRadius: "16px" }}
        >
          <h2 className="text-3xl font-semibold max-w-lg" style={{ fontFamily: "var(--font-fraunces)" }}>
            Ready to run a smarter shop?
          </h2>
          <p className="mt-3 text-base max-w-md" style={{ color: "var(--lp-muted)" }}>
            Set up your account in minutes and see how much easier the day-to-day gets.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="lp-primary px-6 py-3 rounded-lg text-sm font-semibold">
              Get started free
            </Link>
            <Link href="/login" className="lp-ghost px-6 py-3 rounded-lg text-sm font-semibold">
              Log in
            </Link>
            <InstallButton variant="hero" />
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer style={{ borderTop: "1px solid var(--lp-line)" }}>
        <div
          className="max-w-6xl mx-auto px-5 sm:px-6 py-10 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm"
          style={{ color: "var(--lp-muted)" }}
        >
          <span>© {new Date().getFullYear()} UBA, Universal Business Assistant</span>
          <div className="flex gap-6">
            <Link href="/login" className="lp-link">Log in</Link>
            <Link href="/privacy" className="lp-link">Privacy</Link>
            <Link href="/terms" className="lp-link">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}