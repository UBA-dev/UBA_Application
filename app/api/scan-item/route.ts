import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, mimeType, textContent, existingCategories, existingSubCategories } = body;

    if (!imageBase64 && !textContent) {
      return NextResponse.json({ error: "No image or text provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const contextHint = `
Known existing categories in this shop: ${(existingCategories || []).join(", ") || "none yet"}
Known existing sub-categories: ${(existingSubCategories || []).join(", ") || "none yet"}
Reuse these exact names when the item matches one, instead of inventing new near-duplicate categories.`;

    const basePrompt = `You are an inventory assistant for a computer/electronics repair and retail shop.

Analyze the input (image or document text) and identify EVERY distinct inventory item mentioned or shown.

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
      "unitCost": null,
      "sellingPrice": null,
      "supplierName": "",
      "barcodeText": "",
      "confidence": "high" | "medium" | "low",
      "lowConfidenceFields": []
    }
  ]
}

Rules:
- unitCost/sellingPrice: use numbers if visible/stated, otherwise null. Never invent prices that aren't shown.
- barcodeText: only fill if an actual barcode/UPC number is visibly printed near the item, otherwise "".
- confidence: "low" if the image/text is blurry, ambiguous, or you're guessing; "high" if clearly legible.
- lowConfidenceFields: list the field names (e.g. "unitCost", "category") you're unsure about for that item. Empty array if none.
- Keep "name" concise (brand + model when identifiable).
${contextHint}

Respond ONLY with valid JSON in the shape above. No extra text, no markdown.`;

    const parts: any[] = [{ text: basePrompt }];

    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType || "image/jpeg",
          data: imageBase64,
        },
      });
    } else if (textContent) {
      const trimmed = textContent.length > 20000 ? textContent.slice(0, 20000) : textContent;
      parts.push({ text: `\n\nDocument content to analyze:\n"""\n${trimmed}\n"""` });
    }

      const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json({ error: "No result from AI" }, { status: 502 });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Couldn't parse AI response" }, { status: 502 });
    }

    if (!Array.isArray(parsed.items)) {
      return NextResponse.json({ error: "Unexpected AI response format" }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("scan-item error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}