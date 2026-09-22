"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { defaultThemeId } from "../lib/themes";
import { authedFetch } from "../lib/authedFetch";

// Excludes visually ambiguous characters (0/O, 1/I) since owners will read
// this code aloud or type it manually on a shared device.
const SHOP_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateShopCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SHOP_CODE_CHARS[Math.floor(Math.random() * SHOP_CODE_CHARS.length)];
  }
  return code;
}

async function generateUniqueShopCode(): Promise<string> {
  const res = await authedFetch("/api/generate-shop-code", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not generate a shop code.");
  return data.shopCode;
}


export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
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

      const shopCode = await generateUniqueShopCode();

      await setDoc(doc(db, "tenants", user.uid), {
        businessName,
        theme: defaultThemeId,
        subscriptionStatus: "TRIAL",
        // Server-stamped, not a client-supplied string — a forged client
        // could otherwise set this to a future date to fake an unlimited
        // trial (the Firestore rule requires this to equal request.time).
        trialStartDate: serverTimestamp(),
        ownerUid: user.uid,
        ownerEmail: user.email,
        shopCode,
      });

      router.push("/dashboard");
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
          {[1, 2].map((s) => (
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
              placeholder="Enter your business name"
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

        {/* Step 2: Confirm */}
        {step === 2 && (
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

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-300 text-gray-600 font-semibold py-2 rounded-lg"
              >
                Back
              </button>
              <button
                onClick={handleFinish}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
              >
                {loading ? "Setting up..." : "Get Started"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}