"use client";

import { useState } from "react";

// UBA is a Philippines-only product, so this only accepts PH mobile
// numbers — no country picker. A PH mobile number is always 10 digits
// starting with 9 after the +63 (e.g. 9171234567 -> +639171234567).
// Landline numbers don't fit this pattern, but that's intentional: only
// mobile numbers can receive SMS, which matters once UBA can message
// customers directly.
const DIAL_CODE = "+63";
const MAX_DIGITS = 10;
const PH_MOBILE_PATTERN = /^9\d{9}$/;

export function isValidPhMobile(digits: string): boolean {
  return PH_MOBILE_PATTERN.test(digits);
}

// Splits a stored value like "+639171234567" back into just the local
// digits, so editing an existing phone number pre-fills correctly.
export function parsePhoneValue(value: string): string {
  const trimmed = value.startsWith(DIAL_CODE) ? value.slice(DIAL_CODE.length) : value;
  return trimmed.replace(/\D/g, "").slice(-MAX_DIGITS);
}

interface PhoneNumberInputProps {
  value: string;
  onChange: (fullValue: string) => void;
  inputStyle: React.CSSProperties;
  required?: boolean;
}

export default function PhoneNumberInput({ value, onChange, inputStyle, required }: PhoneNumberInputProps) {
  const [digits, setDigits] = useState(() => parsePhoneValue(value));
  const [touched, setTouched] = useState(false);

  const showError = touched && digits.length > 0 && !isValidPhMobile(digits);

  const handleDigitsChange = (raw: string) => {
    const onlyDigits = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
    setDigits(onlyDigits);
    onChange(onlyDigits ? `${DIAL_CODE}${onlyDigits}` : "");
  };

  return (
    <div>
      <div className="flex gap-2">
        <span
          className="px-3 py-2 text-sm flex-shrink-0 flex items-center gap-1"
          style={inputStyle}
        >
          🇵🇭 +63
        </span>
        <input
          type="tel"
          inputMode="numeric"
          required={required}
          pattern="9[0-9]{9}"
          title="10-digit PH mobile number starting with 9 (e.g. 9171234567)"
          value={digits}
          onChange={(e) => handleDigitsChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="9171234567"
          className="flex-1 px-3 py-2"
          style={{
            ...inputStyle,
            borderColor: showError ? "#f87171" : (inputStyle as React.CSSProperties).borderColor,
          }}
        />
      </div>
      {showError && (
        <p className="text-xs mt-1" style={{ color: "#f87171" }}>
          Not a valid PH mobile number — needs 10 digits starting with 9 (e.g. 9171234567).
        </p>
      )}
    </div>
  );
}
