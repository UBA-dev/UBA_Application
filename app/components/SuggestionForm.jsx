"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";

const CATEGORIES = [
  { value: "feature", label: "💡 Feature Request" },
  { value: "bug", label: "🐞 Bug Report" },
  { value: "general", label: "💬 General Feedback" },
];

export default function SuggestionForm() {
  const [uid, setUid] = useState(null);
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("feature");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null); // "success" | "error" | null

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setUid(null);
        return;
      }
      setUid(user.uid); // sarili mismong auth uid — kailangan ito para sa "uid" field sa feedback doc
      setEmail(user.email || "");
      try {
        const session = await getSessionInfo(user);
        const snap = await getDoc(doc(db, "tenants", session.tenantId));
        if (snap.exists()) {
          setBusinessName(snap.data().businessName || "");
        }
      } catch (err) {
        console.error("Failed to load tenant for suggestion form:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!uid || !message.trim() || submitting) return;

    setSubmitting(true);
    setStatus(null);
    try {
      await addDoc(collection(db, "feedback"), {
        uid,
        businessName: businessName || "(No shop name set)",
        email: email || "",
        category,
        message: message.trim(),
        status: "new",
        createdAt: serverTimestamp(),
      });
      setMessage("");
      setStatus("success");
    } catch (err) {
      console.error("Failed to submit feedback:", err);
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 space-y-3"
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-card)",
        borderWidth: "var(--border-width)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className="px-3 py-1.5 text-xs font-semibold rounded-full transition"
            style={{
              background: category === c.value ? "var(--gradient-accent)" : "var(--color-bg-secondary)",
              color: category === c.value ? "#fff" : "var(--color-text-secondary)",
              borderWidth: "1px",
              borderColor: "var(--color-border)",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        placeholder="Isulat dito ang suggestion, bug, o feedback mo. Ang developer lang ang makakabasa nito."
        className="w-full px-3 py-2 text-sm resize-none"
        style={{
          background: "var(--color-bg-secondary)",
          color: "var(--color-text-primary)",
          borderRadius: "var(--radius-button)",
          borderWidth: "var(--border-width)",
          borderColor: "var(--color-border)",
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {status === "success" && "✅ Salamat! Naipadala na ang feedback mo."}
          {status === "error" && "⚠️ Hindi naipadala, subukan ulit."}
        </p>
        <button
          type="submit"
          disabled={!uid || !message.trim() || submitting}
          className="px-4 py-2 text-sm font-semibold disabled:opacity-50 flex-shrink-0"
          style={{
            background: "var(--gradient-accent)",
            color: "#fff",
            borderRadius: "var(--radius-button)",
          }}
        >
          {submitting ? "Sending..." : "Send Feedback"}
        </button>
      </div>
    </form>
  );
}