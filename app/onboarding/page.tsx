"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const BUSINESS_TYPES = [
  { id: "electronics_repair", label: "Electronics / Computer Repair", icon: "🔧" },
  { id: "agrivet", label: "Agrivet & Supply Store", icon: "🌾" },
  { id: "auto_parts", label: "Auto / Motorcycle Parts", icon: "🏍️" },
  { id: "general_retail", label: "General Retail", icon: "🛒" },
];

const THEMES = [
  { id: "dark", label: "Dark", color: "#1f2937" },
  { id: "ocean_blue", label: "Ocean Blue", color: "#0ea5e9" },
  { id: "emerald_green", label: "Emerald Green", color: "#10b981" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [theme, setTheme] = useState("");
  const [customColor, setCustomColor] = useState("#6366f1");
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Protect this page: if nobody is logged in, send them back to sign up
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.push("/signup");
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleFinish = async () => {
    setError("");
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No logged-in user found.");

      await setDoc(doc(db, "tenants", user.uid), {
        businessName,
        businessType,
        theme: useCustomColor ? customColor : theme,
        subscriptionStatus: "TRIAL",
        trialStartDate: new Date().toISOString(),
        ownerUid: user.uid,
        ownerEmail: user.email,
      });

      router.push("/dashboard"); // we'll build this next
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full ${
                s <= step ? "bg-blue-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Business Name */}
        {step === 1 && (
          <div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              What's your business name?
            </h1>
            <p className="text-sm text-gray-500 mb-4">
              This will appear on your dashboard and receipts.
            </p>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Kuya Jun's Repair Shop"
              className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-6"
            />
            <button
              disabled={!businessName.trim()}
              onClick={() => setStep(2)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Business Type */}
        {step === 2 && (
          <div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              What type of business do you run?
            </h1>
            <p className="text-sm text-gray-500 mb-4">
              This helps us tailor the app for you.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setBusinessType(type.id)}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition ${
                    businessType === type.id
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200"
                  }`}
                >
                  <span className="text-3xl">{type.icon}</span>
                  <span className="text-xs text-center text-gray-700">
                    {type.label}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-300 text-gray-600 font-semibold py-2 rounded-lg"
              >
                Back
              </button>
              <button
                disabled={!businessType}
                onClick={() => setStep(3)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Theme */}
        {step === 3 && (
          <div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              Choose your theme
            </h1>
            <p className="text-sm text-gray-500 mb-4">
              Pick a color that fits your brand.
            </p>
            <div className="flex gap-3 mb-4">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setUseCustomColor(false);
                  }}
                  className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 ${
                    theme === t.id && !useCustomColor
                      ? "border-blue-600"
                      : "border-gray-200"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="text-xs text-gray-700">{t.label}</span>
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomColor}
                onChange={(e) => setUseCustomColor(e.target.checked)}
              />
              <span className="text-sm text-gray-600">
                Use a custom color instead
              </span>
              {useCustomColor && (
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="ml-2 w-8 h-8"
                />
              )}
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 border border-gray-300 text-gray-600 font-semibold py-2 rounded-lg"
              >
                Back
              </button>
              <button
                disabled={!theme && !useCustomColor}
                onClick={() => setStep(4)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              You're all set, {businessName}!
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Let's start managing your business smarter.
            </p>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg mb-4">
                {error}
              </p>
            )}

            <button
              onClick={handleFinish}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
            >
              {loading ? "Setting up..." : "Get Started"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}