"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export default function UbaAssistant() {
  const [uid, setUid] = useState(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const businessContextRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUid(user ? user.uid : null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const loadBusinessContext = async () => {
    if (!uid || businessContextRef.current) return;

    const [tenantSnap, invSnap, salesSnap, ticketsSnap] = await Promise.all([
      getDoc(doc(db, "tenants", uid)),
      getDocs(query(collection(db, "tenants", uid, "inventory"), orderBy("name"), limit(60))),
      getDocs(query(collection(db, "tenants", uid, "sales"), orderBy("date", "desc"), limit(25))),
      getDocs(query(collection(db, "tenants", uid, "repairTickets"), orderBy("createdAt", "desc"), limit(20))),
    ]);

    const tenant = tenantSnap.exists() ? tenantSnap.data() : {};

    businessContextRef.current = {
      businessName: tenant.businessName || "",
      businessType: tenant.businessType || "",
      inventory: invSnap.docs.map((d) => {
        const i = d.data();
        return {
          name: i.name,
          category: i.category,
          stock: i.stock,
          threshold: i.threshold,
          unitCost: i.unitCost,
          sellingPrice: i.sellingPrice,
        };
      }),
      recentSales: salesSnap.docs.map((d) => {
        const s = d.data();
        return { itemName: s.itemName, quantity: s.quantity, total: s.total, date: s.date };
      }),
      recentRepairTickets: ticketsSnap.docs.map((d) => {
        const t = d.data();
        return {
          deviceInfo: t.deviceInfo,
          status: t.status,
          laborPayment: t.laborPayment,
          createdAt: t.createdAt,
        };
      }),
    };
    setContextLoaded(true);
  };

  const handleOpen = async () => {
    setOpen(true);
    if (!contextLoaded) await loadBusinessContext();
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: "Hi! Ako si UBA Assistant. Tanong lang tungkol sa shop mo — inventory, sales, repair tickets, o kahit saan pwede bumili ng parts.",
        },
      ]);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/uba-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: newMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          businessContext: businessContextRef.current || {},
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "May problema, subukan ulit." },
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
        title="UBA Assistant"
      >
        <span className="text-2xl">{open ? "×" : "🤖"}</span>
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
            <span>🤖</span>
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
              placeholder="Tanong mo tungkol sa shop mo..."
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
        </div>
      )}
    </>
  );
}