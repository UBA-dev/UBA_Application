"use client";

// Keeps the Owner account on ONE device at a time (see app/lib/ownerSecurity.ts).
//
// - Active device: renders nothing.
// - Another device is active (or this account hasn't verified a device yet):
//   asks for a code emailed to the Owner; on success this device takes over
//   and the other one is signed out within seconds.
// - This device was replaced by another: signs out right away.
//
// The server and the Firestore rules enforce all of this on their own; this
// screen is what the Owner sees.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { authedFetch } from "../lib/authedFetch";
import { deviceLabel, getDeviceId, hashDeviceId } from "../lib/deviceIdentity";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/verify-email", "/onboarding", "/privacy", "/terms"];
const ACTIVE_KEY = "uba-owner-active-sign-in";
export const SIGNED_OUT_KEY = "uba-signed-out-reason";

type Gate =
  | { kind: "none" }
  | { kind: "verify"; maskedEmail: string; activeDeviceLabel: string | null; firstTime: boolean }
  | { kind: "error"; message: string };

type OwnerSessionDoc = {
  activeAuthTime: number;
  activeDeviceHash: string;
  activeDeviceLabel: string;
  activatedAt: string;
};

const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  borderColor: "var(--color-border)",
  borderRadius: "var(--radius-button)",
  borderWidth: "var(--border-width)",
};

const primaryButton: React.CSSProperties = {
  background: "var(--gradient-accent)",
  color: "#fff",
  borderRadius: "var(--radius-button)",
};

export default function OwnerSecurityGate() {
  const pathname = usePathname();
  const router = useRouter();
  const [gate, setGate] = useState<Gate>({ kind: "none" });
  // Read by the session listener (set up once) to know what was on screen.
  const gateRef = useRef<Gate>(gate);
  useEffect(() => {
    gateRef.current = gate;
  }, [gate]);

  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // If email can't be sent (not set up yet, outage) and no device has ever
  // been verified for this account, there's no protection to lose — let the
  // Owner in for now. Taking over from another device can never be skipped.
  const [emailDown, setEmailDown] = useState(false);
  const [postponed, setPostponed] = useState(false);

  useEffect(() => {
    let unsubSession = () => {};
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      unsubSession();
      setGate({ kind: "none" });
      if (!user || !user.emailVerified) return;
      const token = await user.getIdTokenResult();
      if (token.claims.isStaff) return;

      const authTime = Number(token.claims.auth_time);
      const deviceId = getDeviceId();
      const myHash = await hashDeviceId(deviceId);
      let checking = false;

      unsubSession = onSnapshot(
        doc(db, "ownerSessions", user.uid),
        async (snap) => {
          const session = snap.data() as OwnerSessionDoc | undefined;

          if (session && session.activeAuthTime === authTime) {
            storage.set(ACTIVE_KEY, String(authTime));
            // Pages that loaded while this device was locked out failed their
            // reads — start them fresh now that it's the active device.
            if (gateRef.current.kind === "verify" && !gateRef.current.firstTime) window.location.reload();
            setGate({ kind: "none" });
            return;
          }

          // Another device took over this sign-in's place: leave now.
          if (session && session.activeDeviceHash !== myHash && storage.get(ACTIVE_KEY) === String(authTime)) {
            try {
              sessionStorage.setItem(
                SIGNED_OUT_KEY,
                JSON.stringify({ device: session.activeDeviceLabel, at: session.activatedAt })
              );
            } catch {}
            await signOut(auth);
            router.push("/login");
            return;
          }

          if (checking) return;
          checking = true;
          try {
            const res = await authedFetch("/api/owner-security/status", {
              method: "POST",
              body: JSON.stringify({ deviceId, deviceLabel: deviceLabel() }),
            });
            const data = await res.json();
            if (!res.ok) setGate({ kind: "error", message: data.error || "Couldn't check your account security." });
            else if (data.state === "verify")
              setGate({
                kind: "verify",
                maskedEmail: data.maskedEmail,
                activeDeviceLabel: data.activeDeviceLabel,
                firstTime: !!data.firstTime,
              });
            // "active": the session doc changes and this listener closes the gate.
          } catch (err) {
            console.error("owner security status:", err);
            setGate({ kind: "error", message: "Couldn't check your account security. Check your internet connection." });
          } finally {
            checking = false;
          }
        },
        // Offline, or the security rules aren't published yet: don't lock anyone out.
        (err) => console.error("ownerSessions:", err)
      );
    });

    return () => {
      unsubAuth();
      unsubSession();
    };
  }, [router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const blocking =
    gate.kind !== "none" && !PUBLIC_PATHS.includes(pathname) && !(gate.kind === "verify" && gate.firstTime && postponed);
  if (!blocking) return null;

  const sendCode = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch("/api/owner-security/send-code", {
        method: "POST",
        body: JSON.stringify({ deviceId: getDeviceId(), deviceLabel: deviceLabel() }),
      });
      const data = await res.json();
      if (data.state === "active") return;
      if (!res.ok) {
        setError(data.error || "Couldn't send the code. Try again.");
        if (data.retryInSeconds && data.retryInSeconds <= 120) setResendIn(data.retryInSeconds);
        if (res.status === 502) setEmailDown(true);
        return;
      }
      setCodeSentTo(data.maskedEmail);
      setCode("");
      setResendIn(data.resendInSeconds || 60);
    } catch {
      setError("Couldn't send the code. Check your internet connection.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch("/api/owner-security/verify-code", {
        method: "POST",
        body: JSON.stringify({ deviceId: getDeviceId(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Couldn't verify the code.");
      // On success the session doc changes and the listener closes this screen.
    } catch {
      setError("Couldn't verify the code. Check your internet connection.");
    } finally {
      setBusy(false);
    }
  };

  const logOut = async () => {
    await signOut(auth);
    router.push("/login");
  };

  return (
    <div
      className="fixed inset-0 z-90 overflow-y-auto flex items-start sm:items-center justify-center p-4"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <div
        className="w-full max-w-sm p-6 my-8 space-y-4"
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-card)",
          borderWidth: "var(--border-width)",
          borderColor: "var(--color-border)",
          boxShadow: "var(--glow-shadow)",
        }}
      >
        <div className="text-center space-y-2">
          <p className="text-4xl">🔐</p>
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
            {gate.kind === "verify" ? "Confirm it's you" : "Couldn't check your account"}
          </h2>
          <p className="text-sm leading-snug" style={{ color: "var(--color-text-secondary)" }}>
            {gate.kind === "verify"
              ? `${
                  gate.activeDeviceLabel
                    ? `Your UBA account is open on ${gate.activeDeviceLabel}.`
                    : "For your security, only one device can be signed in as Owner at a time."
                } To use it on this device, enter the code we email to ${gate.maskedEmail}.${
                  gate.activeDeviceLabel ? " Your other device will be signed out." : ""
                }`
              : gate.message}
          </p>
        </div>

        {gate.kind === "error" ? (
          <button onClick={() => window.location.reload()} className="w-full py-3 text-sm font-semibold" style={primaryButton}>
            Try again
          </button>
        ) : !codeSentTo ? (
          <button
            onClick={sendCode}
            disabled={busy || resendIn > 0}
            className="w-full py-3 text-sm font-semibold disabled:opacity-50"
            style={primaryButton}
          >
            {busy ? "Sending..." : resendIn > 0 ? `Try again in ${resendIn}s` : "📧 Email me a code"}
          </button>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm text-center leading-snug" style={{ color: "var(--color-text-secondary)" }}>
              Enter the 6-digit code sent to{" "}
              <b className="whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
                {codeSentTo}
              </b>
              . Not in your inbox? Check <b>Spam</b> or <b>Promotions</b>.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="••••••"
              className="w-full px-3 py-3 text-center text-2xl font-bold tracking-[0.5em]"
              style={inputStyle}
              aria-label="6-digit code"
            />
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="w-full py-3 text-sm font-semibold disabled:opacity-50"
              style={primaryButton}
            >
              {busy ? "Checking..." : "Verify & continue"}
            </button>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy || resendIn > 0}
              className="w-full text-sm font-medium disabled:opacity-50"
              style={{ color: "var(--color-primary-light)" }}
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </button>
          </form>
        )}

        {error && (
          <p className="text-sm p-3 rounded-lg" style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.1)" }}>
            {error}
          </p>
        )}

        {gate.kind === "verify" && gate.firstTime && emailDown && (
          <button
            onClick={() => setPostponed(true)}
            className="w-full py-2.5 text-sm font-semibold"
            style={{
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-primary)",
              borderRadius: "var(--radius-button)",
            }}
          >
            Continue for now — verify later
          </button>
        )}

        <p className="text-xs text-center leading-snug" style={{ color: "var(--color-text-secondary)" }}>
          Can&apos;t get into your email? Contact UBA support.
        </p>

        <button onClick={logOut} className="w-full text-sm font-medium" style={{ color: "#f87171" }}>
          Log out
        </button>
      </div>
    </div>
  );
}
