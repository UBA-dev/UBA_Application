"use client";

import { useState } from "react";
import SupportAssistant from "./SupportAssistant";
import SuggestionForm from "./SuggestionForm";

// I-edit/dagdagan mo ito habang lumalaki ang app. Kung gusto mong palawakin
// pa ang alam ng AI chat tungkol sa mga ito, i-update rin ang
// SUPPORT_KNOWLEDGE sa app/api/support-assistant/route.ts.
const FAQS = [
  {
    q: "How do I add a new item to Inventory?",
    a: 'Go to Inventory in the sidebar, click "Add Item" (or a similar button), fill in the name, category, stock, price, and threshold for low stock alert, then save.',
  },
  {
    q: "Why can't I see Repair Tickets / Delivery Tickets / P.O. in the sidebar?",
    a: "Go to Settings > Modules. That feature may be turned off. Just toggle it back ON and it will show up in your sidebar again.",
  },
  {
    q: "How does the Low Stock Alert work?",
    a: "It shows up automatically (🔔 icon) when an item's stock is at or below the threshold you set in Inventory. Click the bell icon to see the list and plan your reorder.",
  },
  {
    q: "Can I change how the app looks?",
    a: "Yes — go to Settings > Choose Your Theme. It applies instantly across the whole app, including the graph style on the Dashboard.",
  },
  {
    q: "Does the app work without internet?",
    a: "UBA has offline caching so you can still see the last loaded data (inventory, sales, etc.) even without a connection. You still need internet to sync new changes, though.",
  },
  {
    q: "Who can read the suggestions or feedback I submit?",
    a: "Only the developer (Zoren) has access to the suggestions/feedback sent here. It's used to keep improving UBA.",
  },
];

function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="space-y-2">
      {FAQS.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={i}
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-card)",
              borderWidth: "var(--border-width)",
              borderColor: "var(--color-border)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-sm font-medium min-w-0" style={{ color: "var(--color-text-primary)" }}>
                {item.q}
              </span>
              <span className="flex-shrink-0" style={{ color: "var(--color-text-secondary)" }}>{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div
                className="px-4 pb-3 text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContactCard() {
  const contacts = [
    { icon: "👤", label: "Developer", value: "Zoren Galagnao" },
    { icon: "📱", label: "Contact Number", value: "0963 750 8043", href: "tel:09637508043" },
    { icon: "📘", label: "Facebook", value: "Zoren Ponce", href: "https://www.facebook.com/zorenponce.galagnao" },
    { icon: "✉️", label: "Gmail", value: "zorenponce@gmail.com", href: "mailto:zorenponce@gmail.com" },
  ];

  return (
    <div
      className="p-4 space-y-3"
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-card)",
        borderWidth: "var(--border-width)",
        borderColor: "var(--color-border)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        If the FAQ or UBA Support didn't answer your question, you can contact me directly here:
      </p>
      <div className="space-y-2">
        {contacts.map((c) => (
          <div key={c.label} className="flex items-center gap-3 text-sm">
            <span>{c.icon}</span>
            <div>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{c.label}</p>
              {c.href ? (
                <a
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                  style={{ color: "var(--color-primary-light)" }}
                >
                  {c.value}
                </a>
              ) : (
                <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{c.value}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HelpSupport() {
  const [tab, setTab] = useState("faq"); // "faq" | "chat" | "suggest"

  const TABS = [
    { key: "faq", label: "❓ FAQ" },
    { key: "chat", label: "🤖 Chat with Support" },
    { key: "suggest", label: "📝 Send Suggestion" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-1.5 text-xs font-semibold rounded-full transition"
            style={{
              background: tab === t.key ? "var(--gradient-accent)" : "var(--color-bg-secondary)",
              color: tab === t.key ? "#fff" : "var(--color-text-secondary)",
              borderWidth: "1px",
              borderColor: "var(--color-border)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "faq" && <FaqAccordion />}
      {tab === "chat" && <SupportAssistant />}
      {tab === "suggest" && <SuggestionForm />}

      <ContactCard />
    </div>
  );
}