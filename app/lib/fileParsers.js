import * as XLSX from "xlsx";
import mammoth from "mammoth";
import Papa from "papaparse";

// ---- Column name guessing (heuristic, no AI needed — fast & exact) ----
const COLUMN_ALIASES = {
  name: ["name", "item", "item name", "product", "product name", "description of item"],
  description: ["description", "desc", "specs", "specification", "details"],
  category: ["category", "type", "group"],
  subCategory: ["sub-category", "subcategory", "sub type", "sub-type"],
  unitCost: ["cost", "unit cost", "buying price", "purchase price", "cost price"],
  sellingPrice: ["price", "selling price", "srp", "retail price", "unit price"],
  supplierName: ["supplier", "vendor", "source"],
  quantity: ["qty", "quantity", "stock", "on hand", "count"],
};

function findColumn(headers, field) {
  const aliases = COLUMN_ALIASES[field];
  const lowerHeaders = headers.map((h) => String(h).toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lowerHeaders.findIndex((h) => h === alias);
    if (idx !== -1) return headers[idx];
  }
  // fallback: partial match
  for (const alias of aliases) {
    const idx = lowerHeaders.findIndex((h) => h.includes(alias));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// Converts an array of row objects (from CSV/Excel) into our standard item shape
export function mapRowsToItems(rows) {
  if (!rows || rows.length === 0) return [];
  const headers = Object.keys(rows[0]);

  const col = {
    name: findColumn(headers, "name"),
    description: findColumn(headers, "description"),
    category: findColumn(headers, "category"),
    subCategory: findColumn(headers, "subCategory"),
    unitCost: findColumn(headers, "unitCost"),
    sellingPrice: findColumn(headers, "sellingPrice"),
    supplierName: findColumn(headers, "supplierName"),
    quantity: findColumn(headers, "quantity"),
  };

  return rows
    .map((row) => ({
      name: col.name ? String(row[col.name] ?? "").trim() : "",
      description: col.description ? String(row[col.description] ?? "").trim() : "",
      category: col.category ? String(row[col.category] ?? "").trim() : "",
      subCategory: col.subCategory ? String(row[col.subCategory] ?? "").trim() : "",
      unitCost: col.unitCost ? Number(row[col.unitCost]) || null : null,
      sellingPrice: col.sellingPrice ? Number(row[col.sellingPrice]) || null : null,
      supplierName: col.supplierName ? String(row[col.supplierName] ?? "").trim() : "",
      quantity: col.quantity ? String(row[col.quantity] ?? "").trim() : "",
    }))
    .filter((item) => item.name); // skip blank rows
}

export function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(mapRowsToItems(results.data)),
      error: reject,
    });
  });
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        resolve(mapRowsToItems(rows));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Returns raw extracted TEXT (not structured rows) — used for DOCX/PDF,
// which then gets sent to Gemini for AI-based item extraction.
export function parseDocxFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
        resolve(result.value);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function parsePdfFile(file) {
  const pdfjsLib = await import("pdfjs-dist/build/pdf");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return fullText;
}

// Figures out which parser to use based on the file's extension/type
export function detectFileKind(file) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "image";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "excel";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pdf")) return "pdf";
  return "unknown";
}