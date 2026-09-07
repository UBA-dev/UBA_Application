"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmailVerification, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setEmail(user.email || "");
      setChecking(false);

      // Poll every 3 seconds — the closest thing to "real-time" for emailVerified,
      // since Firebase Auth doesn't push live updates for this field.
      pollRef.current = setInterval(async () => {
        await user.reload();
        if (auth.currentUser?.emailVerified) {
          if (pollRef.current) clearInterval(pollRef.current);

          const tenantDoc = await getDoc(doc(db, "tenants", user.uid));
          if (tenantDoc.exists()) {
            router.push("/dashboard");
          } else {
            router.push("/onboarding");
          }
        }
      }, 3000);
    });

    return () => {
      unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleResend = async () => {
    const user = auth.currentUser;
    if (!user || resendCooldown > 0) return;
    setResending(true);
    setResendMessage("");
    try {
      await sendEmailVerification(user);
      setResendMessage("Verification email sent. Please check your inbox (and spam folder).");
      setResendCooldown(30);
    } catch (err: any) {
      setResendMessage("Couldn't resend right now. Please try again in a moment.");
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await signOut(auth);
    router.push("/login");
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0e1a" }}>
        <p className="text-sm" style={{ color: "#8b9bc4" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative flex items-center justify-center overflow-hidden px-4"
      style={{ background: "#0a0e1a" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(59,130,246,0.18) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div
          className="relative p-8 text-center"
          style={{
            background: "rgba(20, 29, 51, 0.7)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            borderRadius: "1rem",
            boxShadow: "0 0 20px rgba(59, 130, 246, 0.4), 0 0 40px rgba(59, 130, 246, 0.15)",
          }}
        >
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl"
            style={{ background: "rgba(59, 130, 246, 0.15)" }}
          >
            📧
          </div>

          <h1
            className="text-xl font-bold mb-2"
            style={{ color: "#e8edf9", textShadow: "0 0 18px rgba(59,130,246,0.5)" }}
          >
            Verify Your Email
          </h1>

          <p className="text-sm mb-1" style={{ color: "#8b9bc4" }}>
            We sent a verification link to:
          </p>
          <p className="text-sm font-semibold mb-6" style={{ color: "#60a5fa" }}>
            {email}
          </p>

          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#60a5fa" }} />
            <p className="text-xs" style={{ color: "#8b9bc4" }}>
              Waiting for confirmation — this page will update automatically
            </p>
          </div>

          {resendMessage && (
            <p
              className="text-xs px-3 py-2 rounded-lg mb-4"
              style={{
                color: "#60a5fa",
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
              }}
            >
              {resendMessage}
            </p>
          )}

          <button
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            className="w-full font-semibold py-2.5 mb-3 disabled:opacity-50 hover:opacity-90 transition"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 100%)",
              color: "#fff",
              borderRadius: "0.75rem",
              boxShadow: "0 0 20px rgba(59, 130, 246, 0.35)",
            }}
          >
            {resendCooldown > 0
              ? `Resend available in ${resendCooldown}s`
              : resending
              ? "Sending..."
              : "Resend Verification Email"}
          </button>

          <button
            onClick={handleLogout}
            className="text-sm hover:opacity-80"
            style={{ color: "#8b9bc4" }}
          >
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}