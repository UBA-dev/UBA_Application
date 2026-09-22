"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";
import { hasFeatureAccess, AI_LOCKED_MESSAGE } from "../lib/subscription";
import { authedFetch } from "../lib/authedFetch";
import TypingDots from "./TypingDots";

export default function UbaAssistant() {
  const [uid, setUid] = useState<string | null>(null);
  const [aiAllowed, setAiAllowed] = useState<boolean | null>(null); // null = still checking
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setUid(null);
        setAiAllowed(null);
        return;
      }
      try {
        const session = await getSessionInfo(user);
        setUid(session.tenantId);
        const tenantSnap = await getDoc(doc(db, "tenants", session.tenantId));
        const tenant = tenantSnap.exists() ? tenantSnap.data() : null;
        setAiAllowed(hasFeatureAccess(tenant, "aiFeatures"));
      } catch (err) {
        console.error("Failed to check AI access:", err);
        setAiAllowed(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const handleOpen = () => {
    setOpen(true);
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: aiAllowed
            ? "Hi, I'm UBA Assistant. Ask me anything about your shop — inventory, sales, repair tickets, or where to source parts."
            : AI_LOCKED_MESSAGE,
        },
      ]);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !uid || !aiAllowed) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setSending(true);

    try {
      const res = await authedFetch("/api/uba-assistant", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          history: newMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Something went wrong. Please try again." },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "There was a connection problem. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!uid) return null;

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="fixed bottom-5 right-5 w-14 h-14 rounded-full flex items-center justify-center z-[70] hover:opacity-90 transition"
        style={{
          background: "var(--gradient-accent)",
          boxShadow: "var(--glow-shadow)",
        }}
        title={aiAllowed ? "UBA Assistant" : "UBA Assistant (locked — Pro/Business feature)"}
      >
        <span className="text-2xl">{open ? "×" : aiAllowed ? "🤖" : "🔒"}</span>
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-5 w-[92vw] max-w-sm h-[70vh] max-h-[560px] flex flex-col z-[70] overflow-hidden"
          style={{
            background: "var(--color-surface)",
            borderRadius: "var(--radius-card)",
            borderWidth: "var(--border-width)",
            borderColor: "var(--color-border)",
            boxShadow: "var(--glow-shadow)",
          }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ background: "var(--color-bg-secondary)", borderBottom: "1px solid var(--color-border)" }}
          >
            <span>{aiAllowed ? "🤖" : "🔒"}</span>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}>
              UBA Assistant
            </p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap"
                  style={
                    m.role === "user"
                      ? { background: "var(--gradient-accent)", color: "#fff" }
                      : { background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div
                  className="px-3 py-2 rounded-2xl text-sm"
                  style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
                >
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {aiAllowed ? (
            <div className="p-3 flex gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your shop..."
                className="flex-1 px-3 py-2 text-sm"
                style={{
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-text-primary)",
                  borderRadius: "var(--radius-button)",
                  borderWidth: "var(--border-width)",
                  borderColor: "var(--color-border)",
                }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  background: "var(--gradient-accent)",
                  color: "#fff",
                  borderRadius: "var(--radius-button)",
                }}
              >
                Send
              </button>
            </div>
          ) : (
            <div className="p-3" style={{ borderTop: "1px solid var(--color-border)" }}>
              <a
                href="/settings"
                className="block text-center px-4 py-2 text-sm font-semibold rounded-lg"
                style={{ background: "var(--gradient-accent)", color: "#fff", borderRadius: "var(--radius-button)" }}
              >
                Upgrade in Settings
              </a>
            </div>
          )}
        </div>
      )}
    </>
  );
}