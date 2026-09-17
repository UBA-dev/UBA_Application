"use client";

import { useState } from "react";

export type CountryCode = "PH" | "US" | "OTHER";

type PhoneConfig = {
  label: string;
  dialCode: string;
  maxDigits: number;
  placeholder: string;
};

export const COUNTRY_PHONE_CONFIGS: Record<CountryCode, PhoneConfig> = {
  PH: { label: "🇵🇭 +63", dialCode: "+63", maxDigits: 10, placeholder: "9171234567" },
  US: { label: "🇺🇸 +1", dialCode: "+1", maxDigits: 10, placeholder: "2025551234" },
  OTHER: { label: "🌐 Other", dialCode: "", maxDigits: 15, placeholder: "Enter number" },
};

// Splits a stored value like "+639171234567" back into country + digits,
// so editing an existing phone number pre-fills the right country and digits.
export function parsePhoneValue(value: string): { country: CountryCode; digits: string } {
  if (value.startsWith("+63")) return { country: "PH", digits: value.slice(3) };
  if (value.startsWith("+1")) return { country: "US", digits: value.slice(2) };
  return { country: "OTHER", digits: value.replace(/\D/g, "") };
}

interface PhoneNumberInputProps {
  value: string;
  onChange: (fullValue: string) => void;
  inputStyle: React.CSSProperties;
  required?: boolean;
}

export default function PhoneNumberInput({ value, onChange, inputStyle, required }: PhoneNumberInputProps) {
  const initial = parsePhoneValue(value);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [digits, setDigits] = useState(initial.digits);

  const config = COUNTRY_PHONE_CONFIGS[country];

  const emitChange = (nextCountry: CountryCode, nextDigits: string) => {
    const nextConfig = COUNTRY_PHONE_CONFIGS[nextCountry];
    onChange(nextConfig.dialCode ? `${nextConfig.dialCode}${nextDigits}` : nextDigits);
  };

  const handleDigitsChange = (raw: string) => {
    const onlyDigits = raw.replace(/\D/g, "").slice(0, config.maxDigits);
    setDigits(onlyDigits);
    emitChange(country, onlyDigits);
  };

  const handleCountryChange = (next: CountryCode) => {
    setCountry(next);
    const nextConfig = COUNTRY_PHONE_CONFIGS[next];
    const trimmed = digits.slice(0, nextConfig.maxDigits);
    setDigits(trimmed);
    emitChange(next, trimmed);
  };

  return (
    <div className="flex gap-2">
      <select
        value={country}
        onChange={(e) => handleCountryChange(e.target.value as CountryCode)}
        className="px-2 py-2 text-sm flex-shrink-0"
        style={inputStyle}
      >
        {(Object.keys(COUNTRY_PHONE_CONFIGS) as CountryCode[]).map((c) => (
          <option key={c} value={c}>
            {COUNTRY_PHONE_CONFIGS[c].label}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="numeric"
        required={required}
        value={digits}
        onChange={(e) => handleDigitsChange(e.target.value)}
        placeholder={config.placeholder}
        className="flex-1 px-3 py-2"
        style={inputStyle}
      />
    </div>
  );
}