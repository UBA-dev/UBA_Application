"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import TestPayButton from "@/app/components/TestPayButton";

type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  popular?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    price: "₱299",
    period: "/ month",
    tagline: "For simple POS and inventory tracking",
    features: [
      "POS / Checkout",
      "Inventory Management",
      "Sales & Expenses Tracking",
      "Cloud Backup",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₱499",
    period: "/ month",
    tagline: "For growing shops with repairs and deliveries",
    features: [
      "Everything in Basic",
      "AI Business Analyst",
      "Repair & Delivery Tickets",
      "Low Stock Alerts",
      "Purchase Order (P.O.) Tickets",
    ],
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    price: "₱999",
    period: "/ month",
    tagline: "For larger and multi-branch operations",
    features: [
      "Everything in Pro",
      "Unlimited AI Analysis",
      "Priority Cloud Backup",
      "Multi-Branch Support",
      "Priority Support",
    ],
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"select" | "checkout">("select");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("pro");
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoadingPlan(false);
        return;
      }
      try {
        const tenantSnap = await getDoc(doc(db, "tenants", user.uid));
        if (tenantSnap.exists()) {
          const data = tenantSnap.data();
          // Assumption: active plan is stored as `planId` on the tenant doc,
          // set once payment is confirmed via the Xendit webhook.
          setCurrentPlanId(data.planId || null);
        }
      } catch (err) {
        console.error("Error fetching current plan:", err);
      } finally {
        setLoadingPlan(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const selectedPlan = PLANS.find((p) => p.id === selectedPlanId)!;

  const handleChoosePlan = (planId: string) => {
    if (planId === currentPlanId) return; // Already on this plan — nothing to do
    setSelectedPlanId(planId);
    setStep("checkout");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <div className="w-full max-w-4xl">
        {step === "select" && (
          <button
            onClick={() => router.back()}
            className="text-xs font-medium mb-6 hover:opacity-80 inline-flex items-center gap-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            ← Back
          </button>
        )}

        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold mb-2"
            style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
          >
            {step === "select" ? "Choose Your Plan" : `Checkout — ${selectedPlan.name} Plan`}
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {step === "select"
              ? "Unlock the tools your business needs to grow."
              : "Review your plan details and complete payment to activate it instantly."}
          </p>
          {!loadingPlan && currentPlanId && step === "select" && (
            <p
              className="text-xs font-medium mt-2 inline-block px-3 py-1 rounded-full"
              style={{ background: "rgba(74, 222, 128, 0.15)", color: "#4ade80" }}
            >
              You're currently on the {PLANS.find((p) => p.id === currentPlanId)?.name || currentPlanId} Plan
            </p>
          )}
        </div>

        {step === "select" ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              return (
                <div
                  key={plan.id}
                  className="p-6 flex flex-col relative"
                  style={{
                    background: "var(--color-surface)",
                    borderRadius: "var(--radius-card)",
                    borderWidth: plan.popular || isCurrent ? "2px" : "var(--border-width)",
                    borderColor: isCurrent
                      ? "#4ade80"
                      : plan.popular
                      ? "var(--color-primary-light)"
                      : "var(--color-border)",
                    boxShadow: plan.popular && !isCurrent ? "var(--glow-shadow)" : "none",
                  }}
                >
                  {isCurrent ? (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full text-white"
                      style={{ background: "#22c55e" }}
                    >
                      ✓ Current Plan
                    </span>
                  ) : plan.popular ? (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full text-white"
                      style={{ background: "linear-gradient(135deg, #8b5cf6, #d946ef)" }}
                    >
                      ⭐ Most Popular
                    </span>
                  ) : null}

                  <h3
                    className="text-lg font-bold mb-1"
                    style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
                  >
                    {plan.name}
                  </h3>
                  <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
                    {plan.tagline}
                  </p>

                  <div className="mb-4">
                    <span
                      className="text-2xl font-extrabold"
                      style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
                    >
                      {plan.price}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {plan.period}
                    </span>
                  </div>

                  <ul className="text-xs space-y-2 mb-6 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2" style={{ color: "var(--color-text-primary)" }}>
                        <span style={{ color: "#4ade80" }}>✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleChoosePlan(plan.id)}
                    disabled={isCurrent}
                    className="w-full font-semibold py-2 text-sm transition disabled:cursor-not-allowed"
                    style={{
                      background: isCurrent
                        ? "var(--color-bg-secondary)"
                        : plan.popular
                        ? "var(--gradient-accent)"
                        : "var(--color-bg-secondary)",
                      color: isCurrent
                        ? "var(--color-text-secondary)"
                        : plan.popular
                        ? "#fff"
                        : "var(--color-text-primary)",
                      borderRadius: "var(--radius-button)",
                      borderWidth: plan.popular && !isCurrent ? 0 : "var(--border-width)",
                      borderColor: "var(--color-border)",
                      opacity: isCurrent ? 0.7 : 1,
                    }}
                  >
                    {isCurrent ? "Current Plan" : `Upgrade to ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="max-w-md mx-auto p-8 text-center"
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-card)",
              borderWidth: "var(--border-width)",
              borderColor: "var(--color-border)",
            }}
          >
            <button
              onClick={() => setStep("select")}
              className="text-xs font-medium mb-4 hover:opacity-80"
              style={{ color: "var(--color-text-secondary)" }}
            >
              ← Back to plans
            </button>

            <h2
              className="text-lg font-bold mb-1"
              style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
            >
              {selectedPlan.name} Plan
            </h2>

            <div
              className="flex items-center justify-center gap-1 my-4 py-4"
              style={{ background: "var(--gradient-accent)", borderRadius: "var(--radius-button)" }}
            >
              <span className="text-3xl font-extrabold" style={{ color: "#fff", fontFamily: "var(--font-heading)" }}>
                {selectedPlan.price}
              </span>
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                {selectedPlan.period}
              </span>
            </div>

            <ul className="text-sm space-y-2 mb-6 text-left">
              {selectedPlan.features.map((f) => (
                <li key={f} className="flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                  <span style={{ color: "#4ade80" }}>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="flex justify-center">
              <TestPayButton
                planId={selectedPlan.id}
                planName={`${selectedPlan.name} Monthly`}
                amount={Number(selectedPlan.price.replace(/[^\d]/g, ""))}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}