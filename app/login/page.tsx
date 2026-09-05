"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const tenantDoc = await getDoc(doc(db, "tenants", user.uid));

      if (tenantDoc.exists()) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (err: any) {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center overflow-hidden px-4"
      style={{ background: "var(--color-bg-primary, #0a0e1a)" }}
    >
      {/* Ambient backdrop: radial glow + grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(59,130,246,0.18) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.25]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(59,130,246,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.15) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div
          className="relative p-8"
          style={{
            background: "rgba(20, 29, 51, 0.7)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            borderRadius: "1rem",
            boxShadow:
              "0 0 20px rgba(59, 130, 246, 0.4), 0 0 40px rgba(59, 130, 246, 0.15)",
          }}
        >
          <span className="uba-corner uba-corner-tl" />
          <span className="uba-corner uba-corner-tr" />
          <span className="uba-corner uba-corner-bl" />
          <span className="uba-corner uba-corner-br" />
          <div className="uba-scanline" />

          <p
            className="text-xs font-mono tracking-[0.15em] mb-3"
            style={{ color: "#60a5fa" }}
          >
            UBA SYSTEM // ACCESS TERMINAL
          </p>

          <h1
            className="text-2xl font-bold mb-1"
            style={{
              color: "#e8edf9",
              fontFamily: "var(--font-heading, inherit)",
              textShadow: "0 0 18px rgba(59,130,246,0.5)",
            }}
          >
            Re-enter the System
          </h1>
          <p className="text-sm mb-6" style={{ color: "#8b9bc4" }}>
            Sign in to resume command of your business.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs tracking-wide" style={{ color: "#8b9bc4" }}>
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 bg-transparent focus:outline-none uba-input"
                style={{ color: "#e8edf9" }}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="text-xs tracking-wide" style={{ color: "#8b9bc4" }}>
                Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-14 bg-transparent focus:outline-none uba-input"
                  style={{ color: "#e8edf9" }}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-medium hover:opacity-80"
                  style={{ color: "#60a5fa" }}
                >
                  {showPassword ? "hide" : "show"}
                </button>
              </div>
            </div>

            {error && (
              <p
                className="text-xs px-3 py-2 rounded-lg"
                style={{
                  color: "#f87171",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold py-2.5 mt-2 disabled:opacity-50 hover:opacity-90 transition"
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 100%)",
                color: "#fff",
                borderRadius: "0.75rem",
                boxShadow: "0 0 20px rgba(59, 130, 246, 0.35)",
              }}
            >
              {loading ? "Verifying..." : "Log In"}
            </button>

            <p
              className="text-[11px] font-mono text-center pt-1 tracking-wide"
              style={{ color: "#54608a" }}
            >
              {loading
                ? "> verifying credentials..."
                : "> system ready // awaiting input"}
            </p>
          </form>

          <p className="text-sm text-center mt-6" style={{ color: "#8b9bc4" }}>
            Don't have an account?{" "}
            <Link href="/signup" className="font-medium hover:opacity-80" style={{ color: "#60a5fa" }}>
              Sign Up
            </Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        .uba-input {
          border: none;
          border-bottom: 1px solid rgba(59, 130, 246, 0.25);
          border-radius: 0;
          transition: border-color 0.2s ease;
        }
        .uba-input:focus {
          border-bottom-color: #60a5fa;
        }
        .uba-corner {
          position: absolute;
          width: 18px;
          height: 18px;
          border-color: #60a5fa;
          opacity: 0.8;
        }
        .uba-corner-tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; border-top-left-radius: 4px; }
        .uba-corner-tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; border-top-right-radius: 4px; }
        .uba-corner-bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; border-bottom-left-radius: 4px; }
        .uba-corner-br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; border-bottom-right-radius: 4px; }
        .uba-scanline {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.6), transparent);
          top: 0;
          animation: uba-scan 4s linear infinite;
          pointer-events: none;
        }
        @keyframes uba-scan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .uba-scanline { animation: none; }
        }
      `}</style>
    </div>
  );
}