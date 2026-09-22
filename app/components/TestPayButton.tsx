"use client";

import { useState } from "react";
import { auth } from "@/app/lib/firebase";

interface TestPayButtonProps {
  planId: string;
  planName: string;
  amount: number;
}

export default function TestPayButton({ planId, planName, amount }: TestPayButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("Please log in first before subscribing.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/xendit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: user.uid,
          email: user.email,
          planId,
          planName,
          amount,
        }),
      });

      const data = await response.json();

      if (data.invoiceUrl) {
        window.location.href = data.invoiceUrl;
      } else {
        alert("Error creating payment link: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong with the payment request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className="font-bold py-3 px-6 rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50 hover:opacity-90"
      style={{
        background: "var(--gradient-accent)",
        color: "#fff",
        borderRadius: "var(--radius-button)",
      }}
    >
      {loading ? "Creating Invoice..." : `Pay ₱${amount} with GCash / Maya (Test)`}
    </button>
  );
}