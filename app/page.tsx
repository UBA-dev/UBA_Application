"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { getSessionInfo } from "./lib/staffAuth";
import Link from "next/link";
import { Fraunces } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
});

const PAGE_VARS = {
  "--lp-bg": "#120E1A",
  "--lp-surface": "#1C1626",
  "--lp-border": "#2C2438",
  "--lp-primary": "#8B5CF6",
  "--lp-accent": "#D946EF",
  "--lp-warm": "#FBBF77",
  "--lp-text": "#F5F1FF",
  "--lp-text-secondary": "#B8AFD1",
} as React.CSSProperties;

const features = [
  {
    title: "Keeps selling when the power doesn't",
    body: "Brownouts and dead zones don't have to mean lost sales. UBA's POS keeps working offline and syncs everything automatically once you're back online.",
    featured: true,
  },
  {
    title: "AI Business Analyst",
    body: "Monthly breakdowns of your sales, expenses, and profit — with specific, actionable suggestions based on your shop's real data.",
  },
  {
    title: "Inventory that watches your stock for you",
    body: "Get alerted before an item actually runs out, not after a customer walks away empty-handed.",
  },
  {
    title: "Repairs, deliveries, and purchase orders — one place",
    body: "Stop juggling notebooks and group chats. Track every job, delivery, and order from a single dashboard.",
  },
  {
    title: "Receipts and backups, handled",
    body: "Every sale prints a proper receipt, and every record is backed up to the cloud automatically.",
  },
];

const steps = [
  { step: "1", title: "Create your account", body: "Takes a few minutes. No technical background needed." },
  { step: "2", title: "Add your products", body: "Set up pricing, stock levels, and categories once." },
  { step: "3", title: "Start selling", body: "Open the POS and ring up sales — online or off." },
];

const plans = [
  { name: "Basic", price: "₱299", tagline: "Core POS and inventory tools" },
  { name: "Pro", price: "₱499", tagline: "Adds AI insights, repairs & deliveries", featured: true },
  { name: "Business", price: "₱999", tagline: "Multi-branch, unlimited AI analysis" },
];

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
        // Staff accounts have no email and never go through onboarding —
        // route them straight in based on their role.
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

  if (checkingAuth || isLoggedIn) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#120E1A" }}
      >
        <p className="text-sm" style={{ color: "#B8AFD1" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div
      className={`${fraunces.variable} min-h-screen`}
      style={{ ...PAGE_VARS, background: "var(--lp-bg)", color: "var(--lp-text)" }}
    >
      <header
        className="sticky top-0 z-30 backdrop-blur-md"
        style={{ background: "rgba(18, 14, 26, 0.85)", borderBottom: "1px solid var(--lp-border)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-fraunces)" }}>
            UBA
          </span>
          <nav className="hidden sm:flex items-center gap-8 text-sm" style={{ color: "var(--lp-text-secondary)" }}>
            <a href="#features" className="hover:opacity-80 transition">Features</a>
            <a href="#how-it-works" className="hover:opacity-80 transition">How it works</a>
            <a href="#pricing" className="hover:opacity-80 transition">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm hidden sm:inline" style={{ color: "var(--lp-text-secondary)" }}>
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, var(--lp-primary), var(--lp-accent))" }}
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
        <div>
          <h1
            className="text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.08] font-semibold"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Keep selling. Even when the power doesn't.
          </h1>
          <p className="mt-6 text-lg leading-relaxed max-w-lg" style={{ color: "var(--lp-text-secondary)" }}>
            UBA is a point-of-sale and business management app built for shop owners and repair
            businesses — designed to keep working through brownouts and dead zones, then quietly
            sync everything once you're back online.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="px-6 py-3 rounded-lg text-white font-semibold text-sm transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, var(--lp-primary), var(--lp-accent))" }}
            >
              Get Started Free
            </Link>
            <a
              href="#pricing"
              className="px-6 py-3 rounded-lg font-semibold text-sm transition hover:opacity-80"
              style={{ border: "1px solid var(--lp-border)", color: "var(--lp-text)" }}
            >
              See Pricing
            </a>
          </div>
          <p className="mt-6 text-xs" style={{ color: "var(--lp-text-secondary)" }}>
            No credit card required to start.
          </p>
        </div>

        <div className="relative">
          <div
            className="mx-auto w-full max-w-sm p-6"
            style={{
              background: "var(--lp-surface)",
              border: "1px solid var(--lp-border)",
              borderRadius: "20px",
              boxShadow: "0 30px 60px -20px rgba(139, 92, 246, 0.25)",
            }}
          >
            <div className="flex items-center justify-between pb-4" style={{ borderBottom: "1px dashed var(--lp-border)" }}>
              <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-fraunces)" }}>
                Sales Receipt
              </span>
              <span
                className="text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: "rgba(74, 222, 128, 0.15)", color: "#4ade80" }}
              >
                ● Offline — Saved
              </span>
            </div>
            <div className="py-4 space-y-2.5 text-sm" style={{ fontFamily: "var(--font-geist-mono)" }}>
              <div className="flex justify-between">
                <span style={{ color: "var(--lp-text-secondary)" }}>Prepaid Load × 1</span>
                <span>₱20.00</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--lp-text-secondary)" }}>Snacks × 3</span>
                <span>₱45.00</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--lp-text-secondary)" }}>Soft Drinks × 2</span>
                <span>₱60.00</span>
              </div>
            </div>
            <div
              className="pt-4 flex justify-between items-center"
              style={{ borderTop: "1px dashed var(--lp-border)", fontFamily: "var(--font-geist-mono)" }}
            >
              <span className="text-sm" style={{ color: "var(--lp-text-secondary)" }}>Total</span>
              <span className="text-xl font-semibold" style={{ color: "var(--lp-warm)" }}>₱125.00</span>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6">
        <div style={{ borderTop: "1px solid var(--lp-border)" }} />
      </div>

      <section className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-10">
        <div>
          <h2 className="text-2xl font-semibold mb-4" style={{ fontFamily: "var(--font-fraunces)" }}>
            We know what running a shop actually looks like.
          </h2>
          <ul className="space-y-4 text-sm" style={{ color: "var(--lp-text-secondary)" }}>
            <li>The power or internet cuts out mid-day — and so does your ability to sell.</li>
            <li>Stock counts done by hand, with mistakes that cost you money.</li>
            <li>No clear picture of what's actually profitable and what isn't.</li>
            <li>Repair jobs and deliveries scattered across notebooks and chat threads.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-4" style={{ fontFamily: "var(--font-fraunces)" }}>
            Here's what changes with UBA.
          </h2>
          <ul className="space-y-4 text-sm" style={{ color: "var(--lp-text)" }}>
            <li>Your POS keeps working offline, and syncs the moment you're back online.</li>
            <li>Stock updates automatically with every sale, with alerts before you run out.</li>
            <li>An AI analyst reviews your profit, expenses, and trends for you.</li>
            <li>One app for point-of-sale, repairs, deliveries, and purchase orders.</li>
          </ul>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-semibold mb-10" style={{ fontFamily: "var(--font-fraunces)" }}>
          Everything your shop needs, in one app
        </h2>
        <div className="grid md:grid-cols-2 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className={`p-6 ${f.featured ? "md:col-span-2" : ""}`}
              style={{
                background: "var(--lp-surface)",
                border: f.featured ? "1px solid var(--lp-primary)" : "1px solid var(--lp-border)",
                borderRadius: "14px",
              }}
            >
              <h3 className="text-base font-semibold mb-2">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--lp-text-secondary)" }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-semibold mb-10" style={{ fontFamily: "var(--font-fraunces)" }}>
          Get started in three steps
        </h2>
        <div className="grid sm:grid-cols-3 gap-8 relative">
          {steps.map((s) => (
            <div key={s.step}>
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold mb-4"
                style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-primary)", color: "var(--lp-primary)" }}
              >
                {s.step}
              </span>
              <h3 className="text-base font-semibold mb-1.5">{s.title}</h3>
              <p className="text-sm" style={{ color: "var(--lp-text-secondary)" }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-semibold mb-2" style={{ fontFamily: "var(--font-fraunces)" }}>
          Simple, transparent pricing
        </h2>
        <p className="text-sm mb-10" style={{ color: "var(--lp-text-secondary)" }}>
          Pick the plan that fits your business today. Switch anytime as you grow.
        </p>
        <div className="grid sm:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div
              key={p.name}
              className="p-6"
              style={{
                background: "var(--lp-surface)",
                border: p.featured ? "1px solid var(--lp-primary)" : "1px solid var(--lp-border)",
                borderRadius: "14px",
              }}
            >
              <h3 className="text-sm font-semibold mb-1">{p.name}</h3>
              <p className="text-2xl font-semibold mb-1" style={{ fontFamily: "var(--font-geist-mono)" }}>
                {p.price}<span className="text-xs font-normal" style={{ color: "var(--lp-text-secondary)" }}>/month</span>
              </p>
              <p className="text-xs mb-4" style={{ color: "var(--lp-text-secondary)" }}>{p.tagline}</p>
              <Link
                href="/signup"
                className="block text-center text-sm font-semibold py-2 rounded-lg transition hover:opacity-90"
                style={{
                  background: p.featured ? "linear-gradient(135deg, var(--lp-primary), var(--lp-accent))" : "transparent",
                  border: p.featured ? "none" : "1px solid var(--lp-border)",
                  color: p.featured ? "#fff" : "var(--lp-text)",
                }}
              >
                Choose {p.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div
          className="px-8 py-14 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(217,70,239,0.15))",
            border: "1px solid var(--lp-border)",
            borderRadius: "20px",
          }}
        >
          <h2 className="text-2xl sm:text-3xl font-semibold mb-4" style={{ fontFamily: "var(--font-fraunces)" }}>
            Ready to run a smarter shop?
          </h2>
          <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: "var(--lp-text-secondary)" }}>
            Set up your account in minutes and see how much easier the day-to-day gets.
          </p>
          <Link
            href="/signup"
            className="inline-block px-7 py-3 rounded-lg text-white font-semibold text-sm transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--lp-primary), var(--lp-accent))" }}
          >
            Get Started Free
          </Link>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid var(--lp-border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs" style={{ color: "var(--lp-text-secondary)" }}>
          <span>© {new Date().getFullYear()} UBA — Universal Business Assistant</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:opacity-80">Privacy</Link>
            <Link href="/terms" className="hover:opacity-80">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}