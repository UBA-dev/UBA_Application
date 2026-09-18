"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "../lib/firebase";

export default function SupportAssistant() {
  const [uid, setUid] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUid(user ? user.uid : null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Hi! Ako si UBA Support. Pwede mo akong tanungin kung paano gamitin ang app — settings, features, o kung paano mag-troubleshoot ng common issues.",
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
      const res = await fetch("/api/support-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          message: text,
          history: newMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "May problema sa pag-process, subukan ulit." },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "May problema sa koneksyon, subukan ulit." },
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
              ...
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
          placeholder={uid ? "Magtanong tungkol sa paggamit ng app..." : "Mag-log in muna..."}
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