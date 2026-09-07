"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";

export default function RootPage() {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push("/login");
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500 text-sm">Loading...</p>
    </div>
  );
}