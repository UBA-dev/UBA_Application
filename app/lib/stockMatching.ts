// UBA Scanner: decides whether a scanned line is an item the shop already
// stocks, and how many of that item's stock unit it adds.
//
// The AI suggests a match and reads pack sizes off the document, but the
// final call and every bit of arithmetic happen here, deterministically:
//
//   "Integra 1000 Hog Grower 50kg — 50 sacks"  vs. inventory "Integra 1000"
//   (stocked in Kilogram)  →  50 Sack × 50 kg  =  +2,500 Kilogram
//
// Confirmed restocks teach the item its pack size ("1 Sack = 50 Kilogram")
// and the name the supplier writes it as, so the next scan matches and
// converts on its own.

export const STOCK_UNITS = ["Piece", "Kilogram", "Liter", "Sack", "Box", "Gallon", "Meter"] as const;
export const PACK_UNITS = ["Sack", "Box"] as const;
const GALLON_IN_LITERS = 3.785411784;

export type MatchableItem = {
  id: string;
  name: string;
  description?: string;
  unit: string;
  stock: number;
  unitCost?: number;
  barcode?: string | null;
  // 1 packUnit holds packSize of the item's own unit (e.g. 1 Sack = 50 Kilogram)
  packSize?: number | null;
  packUnit?: string | null;
  // Names this item has been scanned as before (normalized)
  aliases?: string[];
};

export type MatchSource = "barcode" | "learned" | "exact" | "ai" | "name" | "manual";

export const MATCH_SOURCE_LABELS: Record<MatchSource, string> = {
  barcode: "same barcode",
  learned: "scanned under this name before",
  exact: "same name",
  ai: "UBA AI match",
  name: "similar name",
  manual: "chosen by you",
};

export type ConversionSource = "same" | "standard" | "document" | "learned" | "name" | "estimate" | "manual";

export const CONVERSION_SOURCE_LABELS: Record<ConversionSource, string> = {
  same: "same unit",
  standard: "standard conversion",
  document: "from the receipt",
  learned: "remembered from a past restock",
  name: "from the item name",
  estimate: "UBA's estimate — please check",
  manual: "entered by you",
};

// ---- Names ---------------------------------------------------------------------

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(^|\s)\.+|\.+(\s|$)/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SIZE_TOKEN = /^\d+(?:\.\d+)?(?:kgs?|kilos?|kilograms?|g|grams?|gms?|l|ltrs?|liters?|litres?|ml|gal|gallons?|pcs?|pieces?|m|meters?|metres?)$/;
const PACKAGING_WORDS = new Set([
  "sack", "sacks", "bag", "bags", "pack", "packs", "box", "boxes", "pc", "pcs", "piece", "pieces",
  "kg", "kgs", "kilo", "kilos", "liter", "liters", "litre", "litres", "per", "x", "of", "the", "and",
]);

// Identity tokens: no sizes ("50kg") or packaging words, so "Integra 1000 50kg
// sack" and "Integra 1000" compare equal.
function identityTokens(raw: string): string[] {
  const spaced = normalizeName(raw).replace(/(\d)\s+(kgs?|kilos?|g|ml|l|ltrs?|gal|pcs?|m)\b/g, "$1$2");
  return spaced.split(" ").filter((t) => t && !SIZE_TOKEN.test(t) && !PACKAGING_WORDS.has(t));
}

const identityKey = (raw: string) => identityTokens(raw).join(" ");

// Model numbers in a name ("INTG1000" and "Integra 1000" both → "1000").
const modelNumbers = (raw: string) => identityTokens(raw).flatMap((t) => t.match(/\d+(?:\.\d+)?/g) ?? []);

// "Integra 1000" is never "Integra 2000".
function modelNumbersConflict(a: string, b: string): boolean {
  const na = modelNumbers(a);
  const nb = modelNumbers(b);
  return na.length > 0 && nb.length > 0 && !na.some((n) => nb.includes(n));
}

// How alike two product names are, 0..1. Model numbers must agree.
export function nameSimilarity(a: string, b: string): number {
  const ta = identityTokens(a);
  const tb = identityTokens(b);
  if (!ta.length || !tb.length) return 0;
  if (modelNumbersConflict(a, b)) return 0;

  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  if (!shared) return 0;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  // Every word of a 2+ word name appearing in the other: "Integra 1000" in
  // "Integra 1000 Hog Grower". One-word names need an exact match instead,
  // so "Rice" never swallows "Rice Bran".
  if (shorter.length >= 2 && shorter.every((t) => longerSet.has(t))) return 0.9;
  return (2 * shared) / (ta.length + tb.length);
}

export function findStockMatch(
  scan: { name: string; barcode?: string; aiMatchedId?: string | null; aiConfidence?: string | null },
  items: MatchableItem[]
): { item: MatchableItem; source: MatchSource } | null {
  if (scan.barcode) {
    const byBarcode = items.find((i) => i.barcode && i.barcode === scan.barcode);
    if (byBarcode) return { item: byBarcode, source: "barcode" };
  }

  const normalized = normalizeName(scan.name);
  if (!normalized) return null;

  const learned = items.find((i) => i.aliases?.includes(normalized));
  if (learned) return { item: learned, source: "learned" };

  const key = identityKey(scan.name);
  if (key) {
    const exact = items.find((i) => identityKey(i.name) === key);
    if (exact) return { item: exact, source: "exact" };
  }

  const aiItem = scan.aiMatchedId ? items.find((i) => i.id === scan.aiMatchedId) : undefined;
  if (aiItem && !modelNumbersConflict(scan.name, aiItem.name)) {
    // The AI handles abbreviations and misspellings ("INTG-1000" → "Integra
    // 1000"); a less-than-confident answer also needs a shared word.
    if (
      scan.aiConfidence === "high" ||
      (scan.aiConfidence === "medium" && nameSimilarity(scan.name, aiItem.name) > 0)
    ) {
      return { item: aiItem, source: "ai" };
    }
  }

  const scored = items
    .map((item) => ({ item, score: nameSimilarity(scan.name, item.name) }))
    .filter((s) => s.score >= 0.8)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score >= 0.1)) {
    return { item: scored[0].item, source: "name" };
  }
  return null;
}

// ---- Units ---------------------------------------------------------------------

const isPackUnit = (unit: string) => (PACK_UNITS as readonly string[]).includes(unit);

type Measure = { amount: number; unit: string };

// "50kg", "25 kg", "500ml", "1L", "24 pcs" → amount in a stock unit.
export function parseSize(text: string): Measure | null {
  const pattern =
    /(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|kilograms?|grams?|gms?|g|ltrs?|liters?|litres?|ml|l|gallons?|gal|pcs?|pieces?|meters?|metres?|m)\b/gi;
  let last: Measure | null = null;
  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1].replace(",", "."));
    const u = match[2].toLowerCase();
    if (!(amount > 0)) continue;
    if (/^(kgs?|kilos?|kilograms?)$/.test(u)) last = { amount, unit: "Kilogram" };
    else if (/^(grams?|gms?|g)$/.test(u)) last = { amount: amount / 1000, unit: "Kilogram" };
    else if (/^(ltrs?|liters?|litres?|l)$/.test(u)) last = { amount, unit: "Liter" };
    else if (u === "ml") last = { amount: amount / 1000, unit: "Liter" };
    else if (/^(gallons?|gal)$/.test(u)) last = { amount, unit: "Gallon" };
    else if (/^(pcs?|pieces?)$/.test(u)) last = { amount, unit: "Piece" };
    else last = { amount, unit: "Meter" };
  }
  return last;
}

// Converts between plain measures (no packs): same unit or gallons↔liters.
function measureFactor(from: string, to: string): number | null {
  if (from === to) return 1;
  if (from === "Gallon" && to === "Liter") return GALLON_IN_LITERS;
  if (from === "Liter" && to === "Gallon") return 1 / GALLON_IN_LITERS;
  return null;
}

export type Conversion = { factor: number; source: ConversionSource };

// How many of the item's stock unit ONE received unit is.
export function conversionFor(
  receivedUnit: string,
  item: MatchableItem,
  scan: { name: string; contentPerUnit?: number | null; contentUnit?: string | null; contentIsEstimate?: boolean }
): Conversion | null {
  const stockUnit = item.unit;
  if (receivedUnit === stockUnit) return { factor: 1, source: "same" };
  const standard = measureFactor(receivedUnit, stockUnit);
  if (standard != null) return { factor: standard, source: "standard" };

  // Exactly one side is a pack (Sack/Box): find what one pack holds.
  const fromPack = isPackUnit(receivedUnit) && !isPackUnit(stockUnit);
  const toPack = isPackUnit(stockUnit) && !isPackUnit(receivedUnit);
  if (!fromPack && !toPack) return null;
  const pack = fromPack ? receivedUnit : stockUnit;
  const measureUnit = fromPack ? stockUnit : receivedUnit;

  const contentCandidates: { measure: Measure | null; source: ConversionSource }[] = [
    {
      measure:
        scan.contentPerUnit && scan.contentUnit && fromPack
          ? { amount: scan.contentPerUnit, unit: scan.contentUnit }
          : null,
      source: scan.contentIsEstimate ? "estimate" : "document",
    },
    {
      measure:
        item.packSize && item.packSize > 0 && (!item.packUnit || item.packUnit === pack)
          ? { amount: item.packSize, unit: stockUnit }
          : null,
      source: "learned",
    },
    { measure: parseSize(scan.name), source: "name" },
    { measure: parseSize(`${item.name} ${item.description || ""}`), source: "name" },
  ];
  // The receipt beats memory, memory beats names — except an AI estimate,
  // which only fills in when nothing better is known.
  const order: ConversionSource[] = ["document", "learned", "name", "estimate"];
  for (const wanted of order) {
    for (const c of contentCandidates) {
      if (c.source !== wanted || !c.measure) continue;
      const toMeasure = measureFactor(c.measure.unit, measureUnit);
      if (toMeasure == null) continue;
      const perPack = c.measure.amount * toMeasure;
      if (!(perPack > 0)) continue;
      return { factor: fromPack ? perPack : 1 / perPack, source: c.source };
    }
  }
  return null;
}

// Brand = first identity word ("integra" in "Integra 1000 Hog Grower").
export const brandOf = (name: string) => identityTokens(name)[0] ?? "";

// When nothing states the pack size, a sibling of the same brand usually
// shares it: "Integra 2000 50kg" on the same receipt, or another Integra item
// already in stock with a known pack size. Shown as an estimate to check.
export function siblingPackEstimate(
  target: { name: string; unit: string },
  item: MatchableItem,
  scanSiblings: {
    name: string;
    unit: string;
    factor: number | null;
    matchedUnit: string | null;
    contentPerUnit?: number | null;
    contentUnit?: string | null;
  }[],
  items: MatchableItem[]
): number | null {
  if (!isPackUnit(target.unit) || isPackUnit(item.unit)) return null;
  const brand = brandOf(target.name) || brandOf(item.name);
  if (!brand) return null;
  for (const s of scanSiblings) {
    if (s.unit !== target.unit || brandOf(s.name) !== brand) continue;
    if (s.factor && s.factor > 0 && s.matchedUnit === item.unit) return s.factor;
    if (s.contentPerUnit && s.contentPerUnit > 0 && s.contentUnit === item.unit) return s.contentPerUnit;
  }
  for (const other of items) {
    if (other.id === item.id || brandOf(other.name) !== brand) continue;
    if (other.packSize && other.packSize > 0 && other.packUnit === target.unit && other.unit === item.unit) {
      return other.packSize;
    }
  }
  return null;
}

// The pack size to remember on the item after a confirmed restock, if any.
export function learnedPack(receivedUnit: string, item: MatchableItem, factor: number) {
  if (!isPackUnit(receivedUnit) || isPackUnit(item.unit) || !(factor > 0)) return null;
  return { packUnit: receivedUnit, packSize: roundQty(factor) };
}

// Weighted average cost per stock unit after adding new stock.
export function averageCost(oldStock: number, oldCost: number, added: number, newCost: number): number {
  const existing = Math.max(0, oldStock || 0);
  const total = existing + added;
  if (!(total > 0)) return roundMoney(newCost);
  return roundMoney((existing * (oldCost || 0) + added * newCost) / total);
}

export const roundQty = (n: number) => Math.round(n * 1000) / 1000;
export const roundMoney = (n: number) => Math.round(n * 100) / 100;

export function formatQty(n: number): string {
  return roundQty(n).toLocaleString("en-PH", { maximumFractionDigits: 3 });
}
