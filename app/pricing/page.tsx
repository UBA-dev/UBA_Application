"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import { getPlanLabel } from "@/app/lib/subscription";
import {
  PLANS,
  PLAN_IDS,
  PAYMENT_INFO,
  ANNUAL_DISCOUNT_PERCENT,
  TRIAL_DAYS,
  peso,
  planPrice,
  annualPerMonth,
  annualSavings,
  cycleLabel,
} from "@/app/lib/plans";

type Cycle = "monthly" | "annual";

// Ang lahat ng presyo at features ay galing sa app/lib/plans.js — doon lang mag-edit.
// WALANG online payment sa page na ito (manual muna: GCash/cash). Kapag handa na ang
// PayMongo, dito ilalagay ang bagong "Pay online" button.
export default function PricingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"select" | "checkout">("select");
  const [cycle, setCycle] = useState<Cycle>("annual");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("pro");
  const [tenant, setTenant] = useState<any>(null);
  const [userEmail, setUserEmail] = useState("");
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoadingPlan(false);
        return;
      }
      setUserEmail(user.email || "");
      try {
        const tenantSnap = await getDoc(doc(db, "tenants", user.uid));
        if (tenantSnap.exists()) setTenant(tenantSnap.data());
      } catch (err) {
        console.error("Error fetching current plan:", err);
      } finally {
        setLoadingPlan(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const isPaid = tenant?.subscriptionStatus === "MONTHLY" || tenant?.subscriptionStatus === "LIFETIME";
  const currentPlanId: string | null = isPaid ? tenant?.planId || null : null;
  const planInfo = getPlanLabel(tenant);

  const selectedPlan = PLANS[selectedPlanId as keyof typeof PLANS];
  const price = planPrice(selectedPlanId, cycle);
  const reference = `UBA ${selectedPlan.name} ${cycleLabel(cycle)}${userEmail ? ` - ${userEmail}` : ""}`;

  const handleChoosePlan = (planId: string) => {
    setSelectedPlanId(planId);
    setStep("checkout");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* hindi supported ang clipboard — ayos lang, pwede namang i-type */
    }
  };

  const hasPaymentDetails =
    PAYMENT_INFO.mayaNumber || PAYMENT_INFO.gcashNumber || PAYMENT_INFO.bankAccountNumber || PAYMENT_INFO.contactUrl;

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
            {step === "select" ? "Choose Your Plan" : `Upgrade — ${selectedPlan.name} Plan`}
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {step === "select"
              ? `${TRIAL_DAYS}-day free trial for every new account. After that, pick the plan that fits your shop.`
              : "Follow the steps below to activate your plan."}
          </p>
          {!loadingPlan && tenant && step === "select" && (
            <p
              className="text-xs font-medium mt-2 inline-block px-3 py-1 rounded-full"
              style={{
                background: isPaid ? "rgba(74, 222, 128, 0.15)" : "rgba(148, 163, 184, 0.15)",
                color: isPaid ? "#4ade80" : "var(--color-text-secondary)",
              }}
            >
              Current plan: {planInfo.text}
            </p>
          )}
        </div>

        {step === "select" ? (
          <>
            {/* Monthly / Annual toggle */}
            <div className="flex justify-center mb-8">
              <div
                className="inline-flex p-1 gap-1"
                style={{
                  background: "var(--color-surface)",
                  borderRadius: "var(--radius-button)",
                  borderWidth: "var(--border-width)",
                  borderColor: "var(--color-border)",
                }}
              >
                {(["monthly", "annual"] as Cycle[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCycle(c)}
                    className="px-4 py-2 text-sm font-semibold transition"
                    style={{
                      background: cycle === c ? "var(--gradient-accent)" : "transparent",
                      color: cycle === c ? "#fff" : "var(--color-text-secondary)",
                      borderRadius: "var(--radius-button)",
                    }}
                  >
                    {c === "monthly" ? "Monthly" : `Annual — Save ${ANNUAL_DISCOUNT_PERCENT}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {PLAN_IDS.map((id) => {
                const plan = PLANS[id as keyof typeof PLANS];
                const popular = id === "pro";
                const isCurrent = id === currentPlanId;
                return (
                  <div
                    key={id}
                    className="p-6 flex flex-col relative"
                    style={{
                      background: "var(--color-surface)",
                      borderRadius: "var(--radius-card)",
                      borderWidth: popular || isCurrent ? "2px" : "var(--border-width)",
                      borderColor: isCurrent
                        ? "#4ade80"
                        : popular
                        ? "var(--color-primary-light)"
                        : "var(--color-border)",
                      boxShadow: popular && !isCurrent ? "var(--glow-shadow)" : "none",
                    }}
                  >
                    {isCurrent ? (
                      <span
                        className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full text-white"
                        style={{ background: "#22c55e" }}
                      >
                        ✓ Current Plan
                      </span>
                    ) : popular ? (
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
                      {cycle === "monthly" ? (
                        <>
                          <span
                            className="text-2xl font-extrabold"
                            style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
                          >
                            {peso(plan.monthly)}
                          </span>
                          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                            {" "}/ month
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            className="text-2xl font-extrabold"
                            style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
                          >
                            {peso(annualPerMonth(id))}
                          </span>
                          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                            {" "}/ month
                          </span>
                          <p className="text-[11px] mt-1" style={{ color: "var(--color-text-secondary)" }}>
                            <span style={{ textDecoration: "line-through" }}>{peso(plan.monthly)}/mo</span>{" "}
                            · {peso(plan.annual)} billed per year
                          </p>
                          <p className="text-[11px] font-semibold mt-0.5" style={{ color: "#4ade80" }}>
                            Save {ANNUAL_DISCOUNT_PERCENT}% — {peso(annualSavings(id))} saved (3 months free)
                          </p>
                        </>
                      )}
                    </div>

                    <ul className="text-xs space-y-2 mb-6 flex-1">
                      {plan.highlights.map((f: string) => (
                        <li key={f} className="flex items-start gap-2" style={{ color: "var(--color-text-primary)" }}>
                          <span style={{ color: "#4ade80" }}>✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleChoosePlan(id)}
                      className="w-full font-semibold py-2 text-sm transition hover:opacity-90"
                      style={{
                        background: popular ? "var(--gradient-accent)" : "var(--color-bg-secondary)",
                        color: popular ? "#fff" : "var(--color-text-primary)",
                        borderRadius: "var(--radius-button)",
                        borderWidth: popular ? 0 : "var(--border-width)",
                        borderColor: "var(--color-border)",
                      }}
                    >
                      {isCurrent ? `Renew ${plan.name}` : `Choose ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-[11px] mt-6" style={{ color: "var(--color-text-secondary)" }}>
              After your trial or if your plan expires, your data stays safe and POS still works
              (up to 50 items on the Free plan). UBA is not a BIR-accredited receipt/invoice system.
            </p>
          </>
        ) : (
          <div
            className="max-w-md mx-auto p-8"
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

            <div
              className="text-center my-4 py-4"
              style={{ background: "var(--gradient-accent)", borderRadius: "var(--radius-button)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
                {selectedPlan.name} · {cycleLabel(cycle)}
              </p>
              <p className="text-3xl font-extrabold" style={{ color: "#fff", fontFamily: "var(--font-heading)" }}>
                {peso(price)}
                <span className="text-sm font-normal" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {cycle === "annual" ? " / year" : " / month"}
                </span>
              </p>
              {cycle === "annual" && (
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.9)" }}>
                  Save {ANNUAL_DISCOUNT_PERCENT}% · {peso(annualSavings(selectedPlanId))} saved
                </p>
              )}
            </div>

            <h3 className="text-sm font-bold mb-2" style={{ color: "var(--color-text-primary)" }}>
              How to pay
            </h3>
            <ol
              className="text-sm space-y-3 mb-5 list-decimal pl-5"
              style={{ color: "var(--color-text-primary)" }}
            >
              <li>
                Send <b>{peso(price)}</b>
                {hasPaymentDetails ? (
                  <div className="text-xs mt-1 space-y-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    {PAYMENT_INFO.mayaNumber && (
                      <p>
                        Maya: <b>{PAYMENT_INFO.mayaNumber}</b>
                        {PAYMENT_INFO.mayaName && ` (${PAYMENT_INFO.mayaName})`}
                      </p>
                    )}
                    {PAYMENT_INFO.gcashNumber && (
                      <p>
                        GCash: <b>{PAYMENT_INFO.gcashNumber}</b>
                        {PAYMENT_INFO.gcashName && ` (${PAYMENT_INFO.gcashName})`}
                      </p>
                    )}
                    {PAYMENT_INFO.bankAccountNumber && (
                      <p>
                        {PAYMENT_INFO.bankName || "Bank"}: <b>{PAYMENT_INFO.bankAccountNumber}</b>
                        {PAYMENT_INFO.bankAccountName && ` (${PAYMENT_INFO.bankAccountName})`}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    Contact your UBA provider for payment details (or go to Settings → Help &amp; Support).
                  </p>
                )}
              </li>
              <li>
                Put this in your payment message/reference:
                <div className="flex items-center gap-2 mt-1">
                  <code
                    className="text-xs px-2 py-1 rounded flex-1 break-all"
                    style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
                  >
                    {reference}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="text-xs font-semibold px-3 py-1 rounded"
                    style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              </li>
              <li>
                Send a screenshot of your receipt
                {PAYMENT_INFO.contactUrl ? " here: " : " to your UBA provider."}
                {PAYMENT_INFO.contactUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(PAYMENT_INFO.contactUrl, "_blank", "noopener,noreferrer")}
                    className="underline font-semibold"
                  >
                    {PAYMENT_INFO.contactLabel || "Contact us"}
                  </button>
                )}
              </li>
              <li>{PAYMENT_INFO.activationNote}</li>
            </ol>

            <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              {cycle === "annual"
                ? "Annual: 14-day refund after payment. Not auto-renew — we'll remind you before it expires."
                : "Monthly: not auto-renew. Pay again each month to stay active."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}