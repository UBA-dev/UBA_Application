"use client";

import { useState } from "react";
import SupportAssistant from "./SupportAssistant";
import SuggestionForm from "./SuggestionForm";

// I-edit/dagdagan mo ito habang lumalaki ang app. Kung gusto mong palawakin
// pa ang alam ng AI chat tungkol sa mga ito, i-update rin ang
// SUPPORT_KNOWLEDGE sa app/api/support-assistant/route.ts.
const FAQS = [
  {
    q: "Paano ako mag-a-add ng bagong item sa Inventory?",
    a: 'Pumunta sa Inventory sa sidebar, i-click ang "Add Item" (o katulad na button), lagyan ng pangalan, category, stock, presyo, at threshold para sa low stock alert, tapos i-save.',
  },
  {
    q: "Bakit hindi ko makita ang Repair Tickets / Delivery Tickets / P.O. sa sidebar?",
    a: 'Pumunta sa Settings > Modules. Puwedeng na-off ang feature na iyon. I-toggle mo lang ito pabalik ON at lalabas ulit sa sidebar mo.',
  },
  {
    q: "Paano gumagana ang Low Stock Alert?",
    a: "Awtomatiko itong lalabas (🔔 icon) kapag ang stock ng isang item ay mas mababa sa o katumbas ng threshold na na-set mo sa Inventory. I-click ang bell icon para makita ang listahan at ma-plan ang reorder.",
  },
  {
    q: "Pwede ko bang palitan ang itsura/theme ng app?",
    a: 'Oo — pumunta sa Settings > Choose Your Theme. Instant apply ito sa buong app, kasama ang graph style sa Dashboard.',
  },
  {
    q: "Gumagana ba ang app kahit walang internet?",
    a: "May offline caching ang UBA para makita mo pa rin ang huling na-load na data (inventory, sales, etc.) kahit walang koneksyon. Pero kailangan pa rin ng internet para mag-sync ng bagong changes.",
  },
  {
    q: "Sino ang makakabasa ng suggestion o feedback na isusumite ko?",
    a: "Ang developer lang (si Zoren) ang may access sa mga suggestion/feedback na ipinapadala dito. Ginagamit ito para mapaganda pa ang UBA.",
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
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                {item.q}
              </span>
              <span style={{ color: "var(--color-text-secondary)" }}>{isOpen ? "−" : "+"}</span>
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
        Kung hindi nasagot ng FAQ o ng AI assistant ang tanong mo, direkta mo akong ma-co-contact dito:
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