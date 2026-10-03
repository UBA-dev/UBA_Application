"use client";

import { useState } from "react";
import { DEPOSIT_METHODS, money, peso, type DepositType } from "../../lib/register";
import { Modal, Notice, PhotoPicker, inputStyle, primaryButtonStyle } from "./ui";

const offlineMessage = "You're offline. Connect to the internet first — the owner needs to receive this right away.";

export function DepositModal({
  type,
  maxAmount,
  suggestedAmount,
  explanation,
  onClose,
  onSubmit,
}: {
  type: DepositType;
  maxAmount: number;
  suggestedAmount: number;
  explanation: string;
  onClose: () => void;
  onSubmit: (input: { amount: number; method: string; reference: string; proofImage: string }) => Promise<void>;
}) {
  // The previous cash on hand is always deposited in full, so its amount is fixed.
  const fixedAmount = type === "cashOnHand";
  const [amount, setAmount] = useState(suggestedAmount > 0 ? String(money(suggestedAmount)) : "");
  const [method, setMethod] = useState<string>(DEPOSIT_METHODS[0]);
  const [reference, setReference] = useState("");
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const value = fixedAmount ? money(maxAmount) : money(Number(amount));
  const amountError =
    !value || value <= 0
      ? "Enter the amount you deposited."
      : value > maxAmount + 0.005
      ? `You can deposit at most ${peso(maxAmount)} here.`
      : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amountError) return setError(amountError);
    if (!proofImage) return setError("A proof photo is required before you can save a deposit.");
    if (typeof navigator !== "undefined" && !navigator.onLine) return setError(offlineMessage);
    setSaving(true);
    setError("");
    try {
      await onSubmit({ amount: value, method, reference: reference.trim(), proofImage });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't save the deposit. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={type === "cashOnHand" ? "Deposit cash on hand" : "Deposit sales"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm leading-snug" style={{ color: "var(--color-text-secondary)" }}>
          {explanation}
        </p>

        <div>
          <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Amount (₱)
          </label>
          {fixedAmount ? (
            <p
              className="mt-1 px-3 py-2 text-lg font-bold"
              style={{ ...inputStyle, fontFamily: "var(--font-heading)" }}
            >
              {peso(maxAmount)}
            </p>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 px-3 py-2"
              style={inputStyle}
              placeholder="0"
            />
          )}
          {!fixedAmount && (
            <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
              Up to {peso(maxAmount)}
            </p>
          )}
        </div>

        <div>
          <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            How was it deposited?
          </label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full mt-1 px-3 py-2" style={inputStyle}>
            {DEPOSIT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Reference / note (optional)
          </label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full mt-1 px-3 py-2"
            style={inputStyle}
            placeholder="e.g. GCash ref no., bank slip no., who received it"
            maxLength={120}
          />
        </div>

        <PhotoPicker
          label="Proof photo (deposit slip, GCash receipt, or photo of the cash handover)"
          value={proofImage}
          onChange={setProofImage}
          required
        />

        {error && <Notice tone="red">{error}</Notice>}

        <button
          type="submit"
          disabled={saving || !proofImage || !!amountError}
          className="w-full font-semibold py-3 disabled:opacity-50 hover:opacity-90"
          style={primaryButtonStyle}
        >
          {saving ? "Saving..." : `Save deposit${value > 0 ? ` · ${peso(value)}` : ""}`}
        </button>
      </form>
    </Modal>
  );
}

export function ExpenseModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { description: string; amount: number; receiptImage: string | null }) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = money(Number(amount));
    if (!description.trim()) return setError("Describe what the money was spent on.");
    if (!value || value <= 0) return setError("Enter the amount paid.");
    if (typeof navigator !== "undefined" && !navigator.onLine) return setError(offlineMessage);
    setSaving(true);
    setError("");
    try {
      await onSubmit({ description: description.trim(), amount: value, receiptImage });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't save the expense. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add expense from the drawer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm leading-snug" style={{ color: "var(--color-text-secondary)" }}>
          Only for money taken out of today&apos;s cash drawer (e.g. ice, delivery fee, supplies). It lowers the cash
          you&apos;re expected to have.
        </p>
        <div>
          <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            What was it for?
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full mt-1 px-3 py-2"
            style={inputStyle}
            placeholder="e.g. Ice for drinks"
            maxLength={120}
          />
        </div>
        <div>
          <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Amount (₱)
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full mt-1 px-3 py-2"
            style={inputStyle}
            placeholder="0"
          />
        </div>
        <PhotoPicker label="Receipt photo (optional)" value={receiptImage} onChange={setReceiptImage} />
        {error && <Notice tone="red">{error}</Notice>}
        <button
          type="submit"
          disabled={saving}
          className="w-full font-semibold py-3 disabled:opacity-50 hover:opacity-90"
          style={primaryButtonStyle}
        >
          {saving ? "Saving..." : "Save expense"}
        </button>
      </form>
    </Modal>
  );
}

export function ReasonModal({
  title,
  description,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError("Please give a short reason — it's saved in the report.");
    setSaving(true);
    setError("");
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm leading-snug" style={{ color: "var(--color-text-secondary)" }}>
          {description}
        </p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2"
          style={inputStyle}
          placeholder="Reason"
          maxLength={160}
          autoFocus
        />
        {error && <Notice tone="red">{error}</Notice>}
        <button
          type="submit"
          disabled={saving}
          className="w-full font-semibold py-3 disabled:opacity-50 hover:opacity-90"
          style={danger ? { ...primaryButtonStyle, background: "linear-gradient(135deg, #ef4444, #b91c1c)" } : primaryButtonStyle}
        >
          {saving ? "Saving..." : confirmLabel}
        </button>
      </form>
    </Modal>
  );
}
