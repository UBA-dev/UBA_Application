"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "../lib/firebase";
import { getSessionInfo } from "../lib/staffAuth";
import { authedFetch } from "../lib/authedFetch";
import TypingDots from "./TypingDots";

export default function SupportAssistant() {
  const [uid, setUid] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setUid(null);
        return;
      }
      const session = await getSessionInfo(user);
      setUid(session.tenantId);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Hi! I'm UBA Support. You can ask me how to use the app — settings, features, or how to troubleshoot common issues.",
        },
      ]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !uid) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setSending(true);

    try {
      const res = await authedFetch("/api/support-assistant", {
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

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="flex flex-col h-[420px] overflow-hidden"
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-card)",
        borderWidth: "var(--border-width)",
        borderColor: "var(--color-border)",
      }}
    >
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

      <div className="p-3 flex gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!uid}
          placeholder={uid ? "Ask about how to use the app..." : "Please log in first..."}
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
          disabled={sending || !input.trim() || !uid}
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
    </div>
  );
}