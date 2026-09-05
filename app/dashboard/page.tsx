"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import Sidebar from "../components/Sidebar";

export default function DashboardPage() {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      const tenantDoc = await getDoc(doc(db, "tenants", user.uid));
      if (tenantDoc.exists()) {
        setTenant(tenantDoc.data());
      } else {
        router.push("/onboarding");
        return;
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  if (loading || !tenant) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--color-bg-primary)" }}
      >
        <p style={{ color: "var(--color-text-secondary)" }} className="text-sm">
          Loading your dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <div className="flex-1">
        <header
          className="px-6 py-4 border-b"
          style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-border)" }}
        >
          <h1 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
            Welcome back, {tenant.businessName}!
          </h1>
          <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            Trial Status: {tenant.subscriptionStatus}
          </p>
        </header>

        <main className="p-6">
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Use the sidebar to navigate to Inventory, Repair Tickets, or Sales & Expenses.
          </p>
        </main>
      </div>
    </div>
  );
}