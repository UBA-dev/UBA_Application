// The UBA Scanner prompt (app/api/scan-item). Kept apart from the route so it
// can be tested against the model directly.

export type InventoryForScan = {
  id: string;
  name?: string;
  category?: string;
  unit?: string;
  packSize?: number | null;
  packUnit?: string | null;
  aliases?: string[];
};

export function formatInventoryForScan(items: InventoryForScan[]): string {
  if (!items.length) return "(empty — every item is new)";
  return items
    .map((i) => {
      const pack = i.packSize && i.packUnit ? ` | 1 ${i.packUnit} = ${i.packSize} ${i.unit}` : "";
      const aliases =
        Array.isArray(i.aliases) && i.aliases.length ? ` | also written as: ${i.aliases.slice(0, 3).join("; ")}` : "";
      return `${i.id} | ${i.name} | ${i.category || "-"} | stocked in ${i.unit || "Piece"}${pack}${aliases}`;
    })
    .join("\n");
}

export function buildScanPrompt({
  inventoryList,
  existingCategories,
  existingSubCategories,
}: {
  inventoryList: string;
  existingCategories?: string[];
  existingSubCategories?: string[];
}): string {
  const contextHint = `
Known existing categories in this shop: ${(existingCategories || []).join(", ") || "none yet"}
Known existing sub-categories: ${(existingSubCategories || []).join(", ") || "none yet"}
Reuse these exact names when the item matches one, instead of inventing new near-duplicate categories.`;

  return `You are UBA's inventory scanner for a small Philippine shop (it could be a sari-sari store, feeds & agri supply, hardware, pharmacy, grocery, electronics, etc.).

Analyze the input (image or document text) and identify EVERY distinct inventory item mentioned or shown.

THE SHOP'S CURRENT INVENTORY (id | name | category | stock unit | known pack size | other names it was scanned as):
${inventoryList}

Classify the input as one of: "receipt_invoice", "single_product", "price_tag", "handwritten_note", "unknown".

Respond with ONLY this exact JSON shape — items is ALWAYS an array, even if there's only one item:

{
  "documentType": "receipt_invoice" | "single_product" | "price_tag" | "handwritten_note" | "unknown",
  "items": [
    {
      "name": "",
      "description": "",
      "category": "",
      "subCategory": "",
      "unit": "Piece",
      "quantity": null,
      "unitCost": null,
      "sellingPrice": null,
      "supplierName": "",
      "barcodeText": "",
      "confidence": "high" | "medium" | "low",
      "lowConfidenceFields": [],
      "matchedItemId": null,
      "matchConfidence": null,
      "contentPerUnit": null,
      "contentUnit": null,
      "contentIsEstimate": false
    }
  ]
}

Rules:
- unit and quantity: EXACTLY as written for this line — do NOT convert. "50 sacks" -> quantity 50, unit "Sack" (never 2500 Kilogram). unit must be one of: "Piece", "Kilogram", "Liter", "Sack", "Box", "Gallon", "Meter". If only a count is given for a bulk product (feeds, rice, cement, fertilizer, flour), the count is sacks/bags -> "Sack". Default to "Piece" only if genuinely unclear. quantity is null if no amount is shown; never invent one.
- unitCost/sellingPrice: price for ONE of the unit above (per sack if counted in sacks), if visible/stated, otherwise null. Never invent prices that aren't shown.
- matchedItemId: the id from THE SHOP'S CURRENT INVENTORY if this line is the SAME product — even when written differently, abbreviated, misspelled, in other words order, or with extra words like size, packaging or "hog grower". A different variant, model number, flavor or size grade is NOT the same product ("Integra 1000" vs "Integra 2000", "Starter" vs "Grower", "Coke 1.5L" vs "Coke 330ml"). null if there is no such item or you are unsure.
- matchConfidence: "high" when clearly the same product, "medium" when probably, "low" when only a guess; null when matchedItemId is null.
- contentPerUnit / contentUnit: how much product ONE of the unit above holds when unit is "Sack" or "Box" — e.g. "50kg" printed on the sack or in the name -> 50 "Kilogram"; "box of 24" -> 24 "Piece". contentUnit must be one of "Kilogram", "Liter", "Piece", "Meter", "Gallon" (convert grams to kilograms, ml to liters). If the document doesn't say, give your best estimate of the standard pack for that product and set contentIsEstimate true — bulk goods counted in sacks/bags almost always have a standard size (in the Philippines most livestock feeds and rice come in 50 kg sacks, some feeds/starters in 25 kg, cement in 40 kg). Only leave it null when you have no reasonable basis at all.
- barcodeText: only fill if an actual barcode/UPC number is visibly printed near the item, otherwise "".
- confidence: "low" if the image/text is blurry, ambiguous, or you're guessing; "high" if clearly legible.
- lowConfidenceFields: list the field names (e.g. "unitCost", "category") you're unsure about for that item. Empty array if none.
- Keep "name" concise (brand + model when identifiable).
${contextHint}

Respond ONLY with valid JSON in the shape above. No extra text, no markdown.`;
}
