"use client";

import { useEffect, useState } from "react";

type Province = { id: string; regionCode: string; name: string };
type City = { id: string; provinceId: string; name: string };
type Barangay = { id: string; name: string };

// Loaded once and shared across every instance on the page — provinces
// and cities are small enough to just keep in memory for the session.
let provincesCache: Province[] | null = null;
let citiesCache: City[] | null = null;

interface PHAddressInputProps {
  onChange: (composedAddress: string) => void;
  inputStyle: React.CSSProperties;
  required?: boolean;
}

// A guided Philippines address picker: Province -> City/Municipality ->
// Barangay (all from the official PSGC), plus a free-text field for the
// street, house number, or a landmark description (very common in PH
// addressing — e.g. "malapit sa basketball court"). Composes these into
// one formatted address string via onChange, the same shape the rest of
// the app already stores and displays, so nothing downstream needs to
// change. Barangays load lazily per city (one small file per city under
// /public/ph-locations/barangays/) instead of shipping all ~42,000
// barangays up front.
export default function PHAddressInput({ onChange, inputStyle, required }: PHAddressInputProps) {
  const [provinces, setProvinces] = useState<Province[]>(provincesCache || []);
  const [cities, setCities] = useState<City[]>(citiesCache || []);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const [provinceId, setProvinceId] = useState("");
  const [cityId, setCityId] = useState("");
  const [barangayName, setBarangayName] = useState("");
  const [landmark, setLandmark] = useState("");

  useEffect(() => {
    if (provincesCache && citiesCache) {
      setProvinces(provincesCache);
      setCities(citiesCache);
      return;
    }
    Promise.all([
      fetch("/ph-locations/provinces.json").then((r) => r.json()),
      fetch("/ph-locations/cities.json").then((r) => r.json()),
    ]).then(([p, c]) => {
      provincesCache = p;
      citiesCache = c;
      setProvinces(p);
      setCities(c);
    });
  }, []);

  useEffect(() => {
    if (!cityId) {
      setBarangays([]);
      return;
    }
    setLoadingBarangays(true);
    fetch(`/ph-locations/barangays/${cityId}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setBarangays)
      .catch(() => setBarangays([]))
      .finally(() => setLoadingBarangays(false));
  }, [cityId]);

  const citiesForProvince = provinceId ? cities.filter((c) => c.provinceId === provinceId) : [];

  const emit = (nextLandmark: string, nextBarangay: string, nextCityId: string, nextProvinceId: string) => {
    const city = cities.find((c) => c.id === nextCityId);
    const province = provinces.find((p) => p.id === nextProvinceId);
    const parts = [
      nextLandmark.trim(),
      nextBarangay ? `Brgy. ${nextBarangay}` : "",
      city?.name || "",
      province?.name || "",
    ].filter(Boolean);
    onChange(parts.join(", "));
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          required={required}
          value={provinceId}
          onChange={(e) => {
            const next = e.target.value;
            setProvinceId(next);
            setCityId("");
            setBarangayName("");
            emit(landmark, "", "", next);
          }}
          className="w-full px-3 py-2"
          style={inputStyle}
        >
          <option value="">Province</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          required={required}
          value={cityId}
          disabled={!provinceId}
          onChange={(e) => {
            const next = e.target.value;
            setCityId(next);
            setBarangayName("");
            emit(landmark, "", next, provinceId);
          }}
          className="w-full px-3 py-2 disabled:opacity-50"
          style={inputStyle}
        >
          <option value="">{provinceId ? "City / Municipality" : "Select province first"}</option>
          {citiesForProvince.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <select
        required={required}
        value={barangayName}
        disabled={!cityId || loadingBarangays}
        onChange={(e) => {
          const next = e.target.value;
          setBarangayName(next);
          emit(landmark, next, cityId, provinceId);
        }}
        className="w-full px-3 py-2 disabled:opacity-50"
        style={inputStyle}
      >
        <option value="">
          {!cityId ? "Select city/municipality first" : loadingBarangays ? "Loading barangays..." : "Barangay"}
        </option>
        {barangays.map((b) => (
          <option key={b.id} value={b.name}>
            {b.name}
          </option>
        ))}
      </select>

      <input
        type="text"
        required={required}
        value={landmark}
        onChange={(e) => {
          const next = e.target.value;
          setLandmark(next);
          emit(next, barangayName, cityId, provinceId);
        }}
        placeholder="Street, house number, or landmark (e.g. malapit sa basketball court)"
        className="w-full px-3 py-2"
        style={inputStyle}
      />
    </div>
  );
}
