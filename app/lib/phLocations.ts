"use client";

import { useEffect, useState } from "react";

export type Province = { id: string; regionCode: string; name: string };
export type City = { id: string; provinceId: string; name: string };
export type Barangay = { id: string; name: string };

// Shared across every component on the page — provinces (~5KB) and
// cities (~90KB) are small enough to just keep in memory for the
// session once loaded, instead of every picker fetching its own copy.
let provincesCache: Province[] | null = null;
let citiesCache: City[] | null = null;

export function usePhProvincesAndCities() {
  const [provinces, setProvinces] = useState<Province[]>(provincesCache || []);
  const [cities, setCities] = useState<City[]>(citiesCache || []);

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

  return { provinces, cities };
}

// Barangays load lazily per city (one small file per city) instead of
// shipping all ~42,000 up front — most of that data is irrelevant to
// any single form fill.
export function usePhBarangays(cityId: string) {
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cityId) {
      setBarangays([]);
      return;
    }
    setLoading(true);
    fetch(`/ph-locations/barangays/${cityId}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setBarangays)
      .catch(() => setBarangays([]))
      .finally(() => setLoading(false));
  }, [cityId]);

  return { barangays, loading };
}
