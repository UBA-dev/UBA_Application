"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  increment,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import Sidebar from "../components/Sidebar";
import { detectFileKind, parseCSVFile, parseExcelFile, parseDocxFile, parsePdfFile } from "../lib/fileParsers";


type InventoryItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  subCategory: string;
  stock: number;
  threshold: number;
  unitCost: number;
  sellingPrice: number;
  supplierName: string;
  supplierLink: string;
  serialNumbers: string[];
  photoUrl?: string | null;
  barcode?: string | null;
};

type BundleComponent = {
  itemId: string;
  itemName: string;
  quantity: number;
};

type Bundle = {
  id: string;
  name: string;
  description: string;
  category: string;
  subCategory: string;
  components: BundleComponent[];
  price: number;
};

type BrowseCard =
  | { kind: "item"; data: InventoryItem }
  | { kind: "bundle"; data: Bundle };

// ---- Universal Scanner types (matches app/api/scan-item/route.ts) ----

type ScanConfidence = "high" | "medium" | "low";

type ScanDocumentType =
  | "receipt_invoice"
  | "single_product"
  | "price_tag"
  | "handwritten_note"
  | "spreadsheet_import"
  | "unknown";

type ScanApiItem = {
  name: string;
  description: string;
  category: string;
  subCategory: string;
  unitCost: number | null;
  sellingPrice: number | null;
  supplierName: string;
  barcodeText: string;
  confidence: ScanConfidence;
  lowConfidenceFields: string[];
};

type ScanApiResponse = {
  documentType: ScanDocumentType;
  items: ScanApiItem[];
};

// Editable row shown in the scan review UI — one shape whether it's a single
// product or a receipt with many items, so the UI doesn't need two branches.
type ScannedItemRow = {
  selected: boolean;
  name: string;
  description: string;
  category: string;
  subCategory: string;
  unitCost: string;
  sellingPrice: string;
  supplierName: string;
  barcodeText: string;
  confidence: ScanConfidence;
  lowConfidenceFields: string[];
  quantity: string;
};

const documentTypeLabels: Record<ScanDocumentType, string> = {
  receipt_invoice: "🧾 Receipt / Invoice",
  single_product: "📦 Single Product",
  price_tag: "🏷️ Price Tag",
  handwritten_note: "✍️ Handwritten Note",
  spreadsheet_import: "📊 Spreadsheet Import",
  unknown: "❓ Unrecognized Document",
};

const confidenceBadgeStyle: Record<ScanConfidence, React.CSSProperties> = {
  high: { background: "rgba(34, 197, 94, 0.15)", color: "#4ade80" },
  medium: { background: "rgba(234, 179, 8, 0.15)", color: "#facc15" },
  low: { background: "rgba(239, 68, 68, 0.15)", color: "#f87171" },
};

const confidenceLabel: Record<ScanConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Needs review",
};

function normalizeText(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parseSerialNumbers(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Resizes an image client-side and returns raw base64 (no data: prefix) for the Gemini API
function resizeImageForScan(file: File, maxDim = 1024): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


// Small thumbnail (not the full-size AI-scan image) for cheap Firestore storage
function resizeItemPhoto(file: File, maxSize = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  borderColor: "var(--color-border)",
  borderRadius: "var(--radius-button)",
  borderWidth: "var(--border-width)",
};

const labelStyle: React.CSSProperties = {
  color: "var(--color-text-secondary)",
};

// Small pill shown next to a scanned item's name in the review UI
function ConfidenceBadge({ confidence }: { confidence: ScanConfidence }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={confidenceBadgeStyle[confidence]}
    >
      {confidenceLabel[confidence]}
    </span>
  );
}

// Wraps a field's input with a subtle highlight when the AI flagged it as uncertain
function fieldHighlightStyle(fieldName: string, row: ScannedItemRow): React.CSSProperties {
  const flagged = row.lowConfidenceFields.includes(fieldName);
  return flagged
    ? { ...inputStyle, background: "var(--color-surface)", borderColor: "#facc15", borderWidth: 2 }
    : { ...inputStyle, background: "var(--color-surface)" };
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const router = useRouter();

  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedSubCategory, setSelectedSubCategory] = useState("All");

  const [detail, setDetail] = useState<BrowseCard | null>(null);
  const [sellQty, setSellQty] = useState("1");
  const [sellPrice, setSellPrice] = useState("");
  const [sellSerial, setSellSerial] = useState("");
  const [sellMessage, setSellMessage] = useState("");
  const [selling, setSelling] = useState(false);

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [stock, setStock] = useState("");
  const [threshold, setThreshold] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierLink, setSupplierLink] = useState("");
  const [hasSerialNumbers, setHasSerialNumbers] = useState(false);
  const [serialNumbersText, setSerialNumbersText] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [itemBarcode, setItemBarcode] = useState("");

  const [showBundleForm, setShowBundleForm] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [bundleCategory, setBundleCategory] = useState("");
  const [bundleSubCategory, setBundleSubCategory] = useState("");
  const [bundleComponents, setBundleComponents] = useState<BundleComponent[]>([]);
  const [componentPickerCategory, setComponentPickerCategory] = useState("All");
  const [bundlePrice, setBundlePrice] = useState("");
  const [bundlePriceEdited, setBundlePriceEdited] = useState(false);
  const [savingBundle, setSavingBundle] = useState(false);

  // ---- Universal Scanner state ----
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanMode, setScanMode] = useState<"choose" | "photo" | "file">("choose");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanDocumentType, setScanDocumentType] = useState<ScanDocumentType | null>(null);
  const [scanRows, setScanRows] = useState<ScannedItemRow[] | null>(null);
  const [addingBulk, setAddingBulk] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);

      const invQuery = query(
        collection(db, "tenants", user.uid, "inventory"),
        orderBy("name")
      );
      const unsubInv = onSnapshot(invQuery, (snapshot) => {
        setItems(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as InventoryItem[]
        );
      });

      const bundleQuery = query(
        collection(db, "tenants", user.uid, "bundles"),
        orderBy("name")
      );
      const unsubBundles = onSnapshot(bundleQuery, (snapshot) => {
        setBundles(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Bundle[]
        );
      });

      return () => {
        unsubInv();
        unsubBundles();
      };
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (bundlePriceEdited) return;
    const total = bundleComponents.reduce((sum, c) => {
      const item = items.find((i) => i.id === c.itemId);
      return sum + (item ? item.sellingPrice * c.quantity : 0);
    }, 0);
    setBundlePrice(String(total));
  }, [bundleComponents, items, bundlePriceEdited]);

  // ---- Filters ----

  const categories = useMemo(() => {
    const all = [...items.map((i) => i.category), ...bundles.map((b) => b.category)];
    return ["All", ...Array.from(new Set(all.filter(Boolean))).sort()];
  }, [items, bundles]);

  const subCategories = useMemo(() => {
    const relevantItems =
      selectedCategory === "All"
        ? items
        : items.filter((i) => i.category === selectedCategory);
    const relevantBundles =
      selectedCategory === "All"
        ? bundles
        : bundles.filter((b) => b.category === selectedCategory);
    const all = [
      ...relevantItems.map((i) => i.subCategory),
      ...relevantBundles.map((b) => b.subCategory),
    ];
    return ["All", ...Array.from(new Set(all.filter(Boolean))).sort()];
  }, [items, bundles, selectedCategory]);

  useEffect(() => {
    setSelectedSubCategory("All");
  }, [selectedCategory]);

  const filteredCards: BrowseCard[] = useMemo(() => {
    const itemCards: BrowseCard[] = items.map((i) => ({ kind: "item", data: i }));
    const bundleCards: BrowseCard[] = bundles.map((b) => ({ kind: "bundle", data: b }));
    const all = [...itemCards, ...bundleCards];

    const searchLower = searchText.toLowerCase().trim();

    return all.filter((c) => {
      const matchesCategory =
        selectedCategory === "All" || c.data.category === selectedCategory;

      const matchesSubCategory =
        selectedSubCategory === "All" || c.data.subCategory === selectedSubCategory;

      if (!matchesCategory || !matchesSubCategory) return false;

      if (!searchLower) return true;

      if (c.kind === "item") {
        return (
          c.data.name.toLowerCase().includes(searchLower) ||
          c.data.description?.toLowerCase().includes(searchLower) ||
          (c.data.serialNumbers || []).some((sn) =>
            sn.toLowerCase().includes(searchLower)
          )
        );
      }
      return c.data.name.toLowerCase().includes(searchLower);
    });
  }, [items, bundles, selectedCategory, selectedSubCategory, searchText]);

  const allSubCategories = useMemo(() => {
    const all = [...items.map((i) => i.subCategory), ...bundles.map((b) => b.subCategory)];
    return Array.from(new Set(all.filter(Boolean))).sort();
  }, [items, bundles]);

  const componentPickerCategories = useMemo(() => {
    const unique = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
    return ["All", ...unique.sort()];
  }, [items]);

  const componentPickerItems = useMemo(() => {
    return items.filter(
      (i) => componentPickerCategory === "All" || i.category === componentPickerCategory
    );
  }, [items, componentPickerCategory]);

  // Quick lookup used by the scanner to warn when a scanned item looks like
  // something already in inventory (by exact barcode, or close name match).
  const findPossibleExistingMatch = (row: ScannedItemRow): InventoryItem | null => {
    if (row.barcodeText) {
      const byBarcode = items.find((i) => i.barcode && i.barcode === row.barcodeText);
      if (byBarcode) return byBarcode;
    }
    const rowName = row.name.trim().toLowerCase();
    if (!rowName) return null;
    return items.find((i) => i.name.trim().toLowerCase() === rowName) || null;
  };

  // ---- Item form handlers ----

  const resetItemForm = () => {
  setName("");
  setDescription("");
  setCategory(selectedCategory !== "All" ? selectedCategory : "");
  setSubCategory(selectedSubCategory !== "All" ? selectedSubCategory : "");
  setStock("");
  setThreshold("");
  setUnitCost("");
  setSellingPrice("");
  setSupplierName("");
  setSupplierLink("");
  setHasSerialNumbers(false);
  setSerialNumbersText("");
  setPhotoUrl(null);
  setItemBarcode("");
  setEditingItemId(null);
};

  const openAddItemForm = () => {
    resetItemForm();
    setShowItemForm(true);
  };

  const openEditItemForm = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setName(item.name);
    setDescription(item.description || "");
    setCategory(item.category || "");
    setSubCategory(item.subCategory || "");
    setStock(String(item.stock));
    setThreshold(String(item.threshold));
    setUnitCost(String(item.unitCost || ""));
    setSellingPrice(String(item.sellingPrice || ""));
    setSupplierName(item.supplierName || "");
    setSupplierLink(item.supplierLink || "");
    const hasSN = item.serialNumbers && item.serialNumbers.length > 0;
    setHasSerialNumbers(!!hasSN);
    setSerialNumbersText(hasSN ? item.serialNumbers.join("\n") : "");
    setPhotoUrl(item.photoUrl || null);
    setItemBarcode(item.barcode || "");
    setDetail(null);
    setShowItemForm(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setSavingItem(true);

    const itemData = {
      name,
      description,
      category: normalizeText(category),
      subCategory: normalizeText(subCategory),
      stock: Number(stock),
      threshold: Number(threshold),
      unitCost: Number(unitCost) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      supplierName,
      supplierLink,
      serialNumbers: hasSerialNumbers ? parseSerialNumbers(serialNumbersText) : [],
      photoUrl: photoUrl || null,
      barcode: itemBarcode || null,
    };

    try {
      if (editingItemId) {
        await updateDoc(doc(db, "tenants", uid, "inventory", editingItemId), itemData);
      } else {
        await addDoc(collection(db, "tenants", uid, "inventory"), {
          ...itemData,
          createdAt: new Date().toISOString(),
        });
      }
      resetItemForm();
      setShowItemForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!uid) return;
    const confirmed = window.confirm(`Delete "${itemName}"? This cannot be undone.`);
    if (!confirmed) return;
    await deleteDoc(doc(db, "tenants", uid, "inventory", itemId));
    setDetail(null);
  };


  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setPhotoUploading(true);
  try {
    const dataUrl = await resizeItemPhoto(file);
    setPhotoUrl(dataUrl);
  } catch (err) {
    console.error("Photo resize failed:", err);
  } finally {
    setPhotoUploading(false);
    e.target.value = "";
  }
};


  // ---- Bundle form handlers ----

  const resetBundleForm = () => {
    setBundleName("");
    setBundleDescription("");
    setBundleCategory(selectedCategory !== "All" ? selectedCategory : "");
    setBundleSubCategory(selectedSubCategory !== "All" ? selectedSubCategory : "");
    setBundleComponents([]);
    setComponentPickerCategory("All");
    setBundlePrice("");
    setBundlePriceEdited(false);
  };

  const openAddBundleForm = () => {
    resetBundleForm();
    setShowBundleForm(true);
  };

  const handleAddComponent = (item: InventoryItem) => {
    const existing = bundleComponents.find((c) => c.itemId === item.id);
    if (existing) {
      setBundleComponents(
        bundleComponents.map((c) =>
          c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      );
    } else {
      setBundleComponents([
        ...bundleComponents,
        { itemId: item.id, itemName: item.name, quantity: 1 },
      ]);
    }
  };

  const handleDecreaseComponent = (itemId: string) => {
    const existing = bundleComponents.find((c) => c.itemId === itemId);
    if (!existing) return;
    if (existing.quantity <= 1) {
      setBundleComponents(bundleComponents.filter((c) => c.itemId !== itemId));
    } else {
      setBundleComponents(
        bundleComponents.map((c) =>
          c.itemId === itemId ? { ...c, quantity: c.quantity - 1 } : c
        )
      );
    }
  };

  const handleSaveBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || bundleComponents.length === 0) return;
    setSavingBundle(true);

    try {
      await addDoc(collection(db, "tenants", uid, "bundles"), {
        name: bundleName,
        description: bundleDescription,
        category: normalizeText(bundleCategory),
        subCategory: normalizeText(bundleSubCategory),
        components: bundleComponents,
        price: Number(bundlePrice) || 0,
        createdAt: new Date().toISOString(),
      });
      resetBundleForm();
      setShowBundleForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingBundle(false);
    }
  };

  const handleDeleteBundle = async (bundleId: string, name: string) => {
    if (!uid) return;
    const confirmed = window.confirm(`Delete bundle "${name}"?`);
    if (!confirmed) return;
    await deleteDoc(doc(db, "tenants", uid, "bundles", bundleId));
    setDetail(null);
  };

  // ---- Sell handlers ----

  const openSellPanel = (card: BrowseCard) => {
    setDetail(card);
    setSellQty("1");
    setSellSerial("");
    setSellMessage("");
    setSellPrice(String(card.kind === "item" ? card.data.sellingPrice : card.data.price));
  };

  const handleSellItem = async () => {
    if (!uid || !detail || detail.kind !== "item") return;
    const item = detail.data;
    const qty = Number(sellQty);
    if (qty > item.stock) {
      setSellMessage("Not enough stock for this quantity.");
      return;
    }
    setSelling(true);
    setSellMessage("");

    try {
      const total = qty * Number(sellPrice);
      const profit = total - qty * (item.unitCost || 0);

      await addDoc(collection(db, "tenants", uid, "sales"), {
        itemName: item.name,
        quantity: qty,
        price: Number(sellPrice),
        total,
        profit,
        serialNumberUsed: sellSerial || null,
        date: new Date().toISOString(),
      });

      const itemRef = doc(db, "tenants", uid, "inventory", item.id);
      await updateDoc(itemRef, { stock: increment(-qty) });

      if (sellSerial) {
        const remaining = item.serialNumbers.filter((sn) => sn !== sellSerial);
        await updateDoc(itemRef, { serialNumbers: remaining });
      }

      setDetail(null);
    } catch (err) {
      console.error(err);
      setSellMessage("Something went wrong. Please try again.");
    } finally {
      setSelling(false);
    }
  };

  const handleSellBundle = async () => {
    if (!uid || !detail || detail.kind !== "bundle") return;
    const bundle = detail.data;
    const qty = Number(sellQty);

    for (const comp of bundle.components) {
      const invItem = items.find((i) => i.id === comp.itemId);
      const needed = comp.quantity * qty;
      if (!invItem || invItem.stock < needed) {
        setSellMessage(`Not enough stock for "${invItem?.name || comp.itemName}".`);
        return;
      }
    }

    setSelling(true);
    setSellMessage("");

    try {
      let totalCost = 0;
      for (const comp of bundle.components) {
        const invItem = items.find((i) => i.id === comp.itemId);
        totalCost += (invItem?.unitCost || 0) * comp.quantity * qty;
      }

      const total = Number(sellPrice) * qty;
      const profit = total - totalCost;

      await addDoc(collection(db, "tenants", uid, "sales"), {
        itemName: `${bundle.name} (Bundle)`,
        quantity: qty,
        price: Number(sellPrice),
        total,
        profit,
        serialNumberUsed: null,
        date: new Date().toISOString(),
      });

      for (const comp of bundle.components) {
        const itemRef = doc(db, "tenants", uid, "inventory", comp.itemId);
        await updateDoc(itemRef, { stock: increment(-comp.quantity * qty) });
      }

      setDetail(null);
    } catch (err) {
      console.error(err);
      setSellMessage("Something went wrong. Please try again.");
    } finally {
      setSelling(false);
    }
  };

  // ---- Universal Scanner handlers ----

    const openScanModal = () => {
    setShowScanModal(true);
    setScanMode("choose");
    setScanFile(null);
    setScanPreviewUrl(null);
    setScanError("");
    setScanDocumentType(null);
    setScanRows(null);
    setBulkMessage("");
  };

  const closeScanModal = () => {
    setShowScanModal(false);
    if (scanPreviewUrl) URL.revokeObjectURL(scanPreviewUrl);
  };

    const handleScanFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanFile(file);
    setScanPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    setScanError("");
    setScanDocumentType(null);
    setScanRows(null);
  };

    // Sends image or extracted text to Gemini and normalizes the response into ScannedItemRow[]
  const analyzeWithAI = async (payload: {
    imageBase64?: string;
    mimeType?: string;
    textContent?: string;
  }) => {
    const res = await fetch("/api/scan-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        existingCategories: categories.filter((c) => c !== "All"),
        existingSubCategories: allSubCategories,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not analyze the file. Try again.");
    }

    const scanResult = data as ScanApiResponse;

    if (!Array.isArray(scanResult.items) || scanResult.items.length === 0) {
      throw new Error("No items were recognized. Try a clearer file or photo.");
    }

    setScanDocumentType(scanResult.documentType);
    setScanRows(
      scanResult.items.map((it) => ({
        selected: true,
        name: it.name || "",
        description: it.description || "",
        category: it.category || "",
        subCategory: it.subCategory || "",
        unitCost: it.unitCost != null ? String(it.unitCost) : "",
        sellingPrice: it.sellingPrice != null ? String(it.sellingPrice) : "",
        supplierName: it.supplierName || "",
        barcodeText: it.barcodeText || "",
        confidence: it.confidence || "medium",
        lowConfidenceFields: it.lowConfidenceFields || [],
        quantity: "",
      }))
    );
  };

  const handleAnalyzeImage = async () => {
    if (!scanFile) return;
    setScanning(true);
    setScanError("");

    const kind = detectFileKind(scanFile);

    try {
      if (kind === "image") {
        const { base64, mimeType } = await resizeImageForScan(scanFile);
        await analyzeWithAI({ imageBase64: base64, mimeType });
      } else if (kind === "csv" || kind === "excel") {
        // Structured data — parsed directly, no AI needed. Fast, free, and exact.
        const rows = kind === "csv" ? await parseCSVFile(scanFile) : await parseExcelFile(scanFile);

        if (!rows || rows.length === 0) {
          setScanError("Couldn't find any recognizable item rows in this file.");
          return;
        }

        setScanDocumentType("spreadsheet_import");
        setScanRows(
          rows.map((it) => ({
            selected: true,
            name: it.name || "",
            description: it.description || "",
            category: it.category || "",
            subCategory: it.subCategory || "",
            unitCost: it.unitCost != null ? String(it.unitCost) : "",
            sellingPrice: it.sellingPrice != null ? String(it.sellingPrice) : "",
            supplierName: it.supplierName || "",
            barcodeText: "",
            confidence: "high" as const,
            lowConfidenceFields: [],
            quantity: it.quantity || "",
          }))
        );
      } else if (kind === "docx") {
        const text = await parseDocxFile(scanFile);
        if (!text || text.trim().length < 5) {
          setScanError("Couldn't extract any text from this Word document.");
          return;
        }
        await analyzeWithAI({ textContent: text });
      } else if (kind === "pdf") {
        const text = await parsePdfFile(scanFile);
        if (!text || text.trim().length < 5) {
          setScanError(
            "Couldn't read text from this PDF — it may be a scanned image. Try taking a photo of it instead."
          );
          return;
        }
        await analyzeWithAI({ textContent: text });
      } else {
        setScanError("Unsupported file type. Try an image, PDF, Word, Excel, or CSV file.");
      }
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || "Something went wrong while analyzing the file.");
    } finally {
      setScanning(false);
    }
  };

  // Used when the scan found exactly one item — prefills the normal item form
  const handleUseScanRowData = async (row: ScannedItemRow) => {
    resetItemForm();
    setName(row.name);
    setDescription(row.description);
    setCategory(row.category);
    setSubCategory(row.subCategory);
    setUnitCost(row.unitCost);
    setSellingPrice(row.sellingPrice);
    setSupplierName(row.supplierName);
    setItemBarcode(row.barcodeText);

    // Reuse the scanned photo as the item's thumbnail — no extra step for the owner
    if (scanFile) {
      try {
        const thumbnail = await resizeItemPhoto(scanFile);
        setPhotoUrl(thumbnail);
      } catch (err) {
        console.error("Couldn't create thumbnail from scan photo:", err);
      }
    }

    closeScanModal();
    setShowItemForm(true);
  };

  const updateScanRow = (index: number, field: keyof ScannedItemRow, value: string | boolean) => {
    if (!scanRows) return;
    setScanRows(
      scanRows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleBulkAddItems = async () => {
    if (!uid || !scanRows) return;
    const selectedRows = scanRows.filter((r) => r.selected);

    if (selectedRows.length === 0) {
      setBulkMessage("Select at least one item to add.");
      return;
    }
    const missingQty = selectedRows.some((r) => r.quantity === "" || Number(r.quantity) < 0);
    if (missingQty) {
      setBulkMessage("Please enter a quantity for every selected item.");
      return;
    }

    setAddingBulk(true);
    setBulkMessage("");

    try {
      for (const row of selectedRows) {
        await addDoc(collection(db, "tenants", uid, "inventory"), {
          name: row.name,
          description: row.description,
          category: normalizeText(row.category),
          subCategory: normalizeText(row.subCategory),
          stock: Number(row.quantity) || 0,
          threshold: 3,
          unitCost: Number(row.unitCost) || 0,
          sellingPrice: Number(row.sellingPrice) || 0,
          supplierName: row.supplierName,
          supplierLink: "",
          serialNumbers: [],
          barcode: row.barcodeText || null,
          createdAt: new Date().toISOString(),
        });
      }
      closeScanModal();
    } catch (err) {
      console.error(err);
      setBulkMessage("Something went wrong while adding items. Please try again.");
    } finally {
      setAddingBulk(false);
    }
  };

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1
              className="text-xl font-bold"
              style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
            >
              Inventory
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Manage your items and stock levels
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openScanModal}
              className="font-semibold px-4 py-2 text-sm transition hover:opacity-90"
              style={{
                background: "var(--color-surface)",
                color: "var(--color-primary-light)",
                borderRadius: "var(--radius-button)",
                borderWidth: "var(--border-width)",
                borderColor: "var(--color-primary)",
                boxShadow: "var(--glow-shadow)",
              }}
            >
              🔍 Universal Scanner
            </button>
            <button
              onClick={openAddItemForm}
              className="font-semibold px-4 py-2 text-sm transition hover:opacity-90"
              style={{
                background: "var(--gradient-accent)",
                color: "#fff",
                borderRadius: "var(--radius-button)",
                boxShadow: "var(--glow-shadow)",
              }}
            >
              + Add Item
            </button>
            <button
              onClick={openAddBundleForm}
              disabled={items.length === 0}
              title={items.length === 0 ? "Add inventory items first" : ""}
              className="font-semibold px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition hover:opacity-90"
              style={{
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
                borderRadius: "var(--radius-button)",
                borderWidth: "var(--border-width)",
                borderColor: "var(--color-border)",
              }}
            >
              🧩 New Bundle
            </button>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by name, description, or Serial Number..."
            className="w-full px-4 py-2"
            style={inputStyle}
          />
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition"
                style={{
                  background: isActive ? "var(--color-primary)" : "var(--color-surface)",
                  color: isActive ? "#fff" : "var(--color-text-secondary)",
                  boxShadow: isActive ? "var(--glow-shadow)" : "none",
                  borderWidth: isActive ? 0 : "var(--border-width)",
                  borderColor: "var(--color-border)",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Sub-category chips */}
        {subCategories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {subCategories.map((sub) => {
              const isActive = selectedSubCategory === sub;
              return (
                <button
                  key={sub}
                  onClick={() => setSelectedSubCategory(sub)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition"
                  style={{
                    background: isActive ? "var(--color-secondary)" : "var(--color-surface)",
                    color: isActive ? "#fff" : "var(--color-primary-light)",
                  }}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        )}

        {/* Item + Bundle table */}
        {filteredCards.length === 0 ? (
          <div
            className="p-8 text-center"
            style={{
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--glow-shadow)",
            }}
          >
            No items found. Try a different search or filter, or click "+ Add Item".
          </div>
        ) : (
          <div
            className="overflow-hidden"
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-card)",
              borderWidth: "var(--border-width)",
              borderColor: "var(--color-border)",
            }}
          >
            <table className="w-full text-sm">
              <thead
                className="text-left"
                style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
              >
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Stock</th>
                  <th className="px-4 py-2">Price</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((card) => {
                  if (card.kind === "item") {
                    const item = card.data;
                    const isLow = item.stock <= item.threshold;
                    return (
                      <tr
                        key={`item-${item.id}`}
                        className="align-top"
                        style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}
                      >
                        <td className="px-4 py-3">
  <div className="flex items-start gap-2">
    <button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    if (item.photoUrl) setViewingPhoto(item.photoUrl);
  }}
  disabled={!item.photoUrl}
  className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center disabled:cursor-default"
  style={{ background: "var(--color-bg-secondary)", cursor: item.photoUrl ? "zoom-in" : "default" }}
>
  {item.photoUrl ? (
    <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover" />
  ) : (
    <span className="text-sm">📦</span>
  )}
</button>
    <div>
      <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
        {item.name}
      </p>
      {item.description && (
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          {item.description}
        </p>
      )}
      {item.serialNumbers?.length > 0 && (
        <p className="text-xs mt-1" style={{ color: "var(--color-primary-light)" }}>
          {item.serialNumbers.length} SN on file
        </p>
      )}
    </div>
  </div>
</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                              background: isLow ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                              color: isLow ? "#f87171" : "#4ade80",
                            }}
                          >
                            {item.stock} {isLow ? "(Low)" : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                          ₱{item.sellingPrice.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <button
                              onClick={() => openSellPanel(card)}
                              className="text-xs font-medium hover:underline"
                              style={{ color: "#4ade80" }}
                            >
                              Sell
                            </button>
                            <button
                              onClick={() => openEditItemForm(item)}
                              className="text-xs font-medium hover:underline"
                              style={{ color: "var(--color-primary-light)" }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id, item.name)}
                              className="text-xs font-medium hover:underline"
                              style={{ color: "#f87171" }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  } else {
                    const bundle = card.data;
                    return (
                      <tr
                        key={`bundle-${bundle.id}`}
                        className="align-top"
                        style={{
                          borderTopWidth: "var(--border-width)",
                          borderColor: "var(--color-border)",
                          background: "var(--color-surface-glass)",
                        }}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {bundle.name}{" "}
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "var(--color-secondary)", color: "#fff" }}
                            >
                              Bundle
                            </span>
                          </p>
                          {bundle.description && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                              {bundle.description}
                            </p>
                          )}
                          <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                            {bundle.components.length} components
                          </p>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>
                          {bundle.category}
                          {bundle.subCategory && (
                            <span className="block text-xs" style={{ color: "var(--color-primary-light)" }}>
                              {bundle.subCategory}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          —
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                          ₱{bundle.price.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <button
                              onClick={() => openSellPanel(card)}
                              className="text-xs font-medium hover:underline"
                              style={{ color: "#4ade80" }}
                            >
                              Sell
                            </button>
                            <button
                              onClick={() => handleDeleteBundle(bundle.id, bundle.name)}
                              className="text-xs font-medium hover:underline"
                              style={{ color: "#f87171" }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- SELL PANEL ---- */}
        {detail && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <div
              className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--glow-shadow)",
                borderWidth: "var(--border-width)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="flex justify-between items-start mb-4">
                <h3
                  className="text-lg font-bold"
                  style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
                >
                  {detail.kind === "item" ? detail.data.name : `${detail.data.name} (Bundle)`}
                </h3>
                <button
                  onClick={() => setDetail(null)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>

              {detail.kind === "item" && detail.data.serialNumbers?.length > 0 && (
                <div className="mb-4">
                  <label className="text-sm" style={labelStyle}>
                    Serial Number Sold
                  </label>
                  <select
                    value={sellSerial}
                    onChange={(e) => setSellSerial(e.target.value)}
                    className="w-full mt-1 px-3 py-2"
                    style={inputStyle}
                  >
                    <option value="">No serial number selected</option>
                    {detail.data.serialNumbers.map((sn) => (
                      <option key={sn} value={sn}>
                        {sn}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-sm" style={labelStyle}>
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={sellQty}
                    onChange={(e) => setSellQty(e.target.value)}
                    className="w-full mt-1 px-3 py-2"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-sm" style={labelStyle}>
                    Price (₱)
                  </label>
                  <input
                    type="number"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    className="w-full mt-1 px-3 py-2"
                    style={inputStyle}
                  />
                </div>
              </div>

              {sellMessage && (
                <p
                  className="text-sm p-2 rounded-lg mb-3"
                  style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.1)" }}
                >
                  {sellMessage}
                </p>
              )}

              <button
                onClick={detail.kind === "item" ? handleSellItem : handleSellBundle}
                disabled={selling}
                className="w-full font-semibold py-2.5 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "#fff",
                  borderRadius: "var(--radius-button)",
                }}
              >
                {selling ? "Processing..." : "Confirm Sale"}
              </button>
            </div>
          </div>
        )}

        {/* ---- ADD/EDIT ITEM FORM MODAL ---- */}
        {showItemForm && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form
              onSubmit={handleSaveItem}
              className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4"
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--glow-shadow)",
                borderWidth: "var(--border-width)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="sm:col-span-2 flex justify-between items-center">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  {editingItemId ? "Editing item" : "New item"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowItemForm(false)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>
          



                            <div className="sm:col-span-2 flex items-center gap-4">
                <input
                  type="file"
                  accept="image/*"
                  ref={photoInputRef}
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  title={photoUrl ? "Click to change photo" : "Click to add a photo"}
                  className="w-20 h-20 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 disabled:opacity-60 hover:opacity-90 transition"
                  style={{
                    background: "var(--color-bg-secondary)",
                    borderWidth: "var(--border-width)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  {photoUploading ? (
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      ...
                    </span>
                  ) : photoUrl ? (
                    <img src={photoUrl} alt="Item" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">📷</span>
                  )}
                </button>

                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Item Photo
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploading}
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: "var(--color-primary-light)" }}
                    >
                      {photoUploading ? "Processing..." : photoUrl ? "Change Photo" : "Add Photo"}
                    </button>
                    {photoUrl && (
                      <button
                        type="button"
                        onClick={() => setPhotoUrl(null)}
                        className="text-sm font-medium hover:underline"
                        style={{ color: "#f87171" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    Optional — helps identify the item at a glance.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Item Name
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. Motherboard - MSI B450"
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Category
                </label>
                <input
                  list="category-suggestions"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. Computer Parts"
                />
                <datalist id="category-suggestions">
                  {categories.filter((c) => c !== "All").map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="sm:col-span-2">
                <label className="text-sm" style={labelStyle}>
                  Sub-Category / Type
                </label>
                <input
                  list="subcategory-suggestions"
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. Motherboard (optional)"
                />
                <datalist id="subcategory-suggestions">
                  {allSubCategories.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  Optional — groups similar items together for easier browsing.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className="text-sm" style={labelStyle}>
                  Description (specs, brand, model)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Current Stock
                </label>
                <input
                  required
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Low Stock Threshold
                </label>
                <input
                  required
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Unit Cost (₱)
                </label>
                <input
                  type="number"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Selling Price (₱)
                </label>
                <input
                  type="number"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Supplier Name
                </label>
                <input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Supplier Order Link
                </label>
                <input
                  value={supplierLink}
                  onChange={(e) => setSupplierLink(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Barcode / UPC
                </label>
                <input
                  value={itemBarcode}
                  onChange={(e) => setItemBarcode(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="Optional — from scanner or manual entry"
                />
              </div>

              <div
                className="sm:col-span-2 pt-4"
                style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}
              >
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={hasSerialNumbers}
                    onChange={(e) => setHasSerialNumbers(e.target.checked)}
                  />
                  <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    This item has Serial Numbers
                  </span>
                </label>
                {hasSerialNumbers && (
                  <textarea
                    value={serialNumbersText}
                    onChange={(e) => setSerialNumbersText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 font-mono text-sm"
                    style={inputStyle}
                    placeholder="One Serial Number per line"
                  />
                )}
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingItem}
                  className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                  style={{
                    background: "var(--gradient-accent)",
                    color: "#fff",
                    borderRadius: "var(--radius-button)",
                    boxShadow: "var(--glow-shadow)",
                  }}
                >
                  {savingItem ? "Saving..." : editingItemId ? "Update Item" : "Save Item"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ---- NEW BUNDLE FORM MODAL ---- */}
        {showBundleForm && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <form
              onSubmit={handleSaveBundle}
              className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-4"
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--glow-shadow)",
                borderWidth: "var(--border-width)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  New Bundle
                </p>
                <button
                  type="button"
                  onClick={() => setShowBundleForm(false)}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Bundle Name
                </label>
                <input
                  required
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                  placeholder="e.g. Ryzen 5 Starter Build"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm" style={labelStyle}>
                    Category
                  </label>
                  <input
                    list="category-suggestions"
                    required
                    value={bundleCategory}
                    onChange={(e) => setBundleCategory(e.target.value)}
                    className="w-full mt-1 px-3 py-2"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-sm" style={labelStyle}>
                    Sub-Category
                  </label>
                  <input
                    list="subcategory-suggestions"
                    value={bundleSubCategory}
                    onChange={(e) => setBundleSubCategory(e.target.value)}
                    className="w-full mt-1 px-3 py-2"
                    style={inputStyle}
                    placeholder="e.g. PC Builds (optional)"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Description
                </label>
                <textarea
                  value={bundleDescription}
                  onChange={(e) => setBundleDescription(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <div className="pt-4" style={{ borderTopWidth: "var(--border-width)", borderColor: "var(--color-border)" }}>
                <label className="text-sm font-medium" style={labelStyle}>
                  Tap items to add them as components
                </label>
                <div className="flex flex-wrap gap-2 mt-2 mb-3">
                  {componentPickerCategories.map((cat) => {
                    const isActive = componentPickerCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setComponentPickerCategory(cat)}
                        className="px-3 py-1 rounded-full text-xs font-medium transition"
                        style={{
                          background: isActive ? "var(--color-primary)" : "var(--color-bg-secondary)",
                          color: isActive ? "#fff" : "var(--color-text-secondary)",
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {items.length === 0 ? (
                    <p className="col-span-full text-sm py-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
                      No inventory items yet. Add items first before creating a bundle.
                    </p>
                  ) : (
                    componentPickerItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAddComponent(item)}
                        className="p-3 text-left transition hover:opacity-80"
                        style={{
                          background: "var(--color-bg-secondary)",
                          borderRadius: "var(--radius-button)",
                          borderWidth: "var(--border-width)",
                          borderColor: "var(--color-border)",
                        }}
                      >
                        <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {item.name}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          ₱{item.sellingPrice.toLocaleString()} · Stock: {item.stock}
                        </p>
                      </button>
                    ))
                  )}
                </div>

                {bundleComponents.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      In this bundle:
                    </p>
                    {bundleComponents.map((c) => (
                      <div
                        key={c.itemId}
                        className="flex justify-between items-center px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-bg-secondary)" }}
                      >
                        <span style={{ color: "var(--color-text-primary)" }}>{c.itemName}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDecreaseComponent(c.itemId)}
                            className="w-6 h-6 rounded-full font-bold"
                            style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}
                          >
                            −
                          </button>
                          <span
                            className="font-medium min-w-[1.5rem] text-center"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {c.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const item = items.find((i) => i.id === c.itemId);
                              if (item) handleAddComponent(item);
                            }}
                            className="w-6 h-6 rounded-full font-bold"
                            style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm" style={labelStyle}>
                  Bundle Price (₱)
                </label>
                <input
                  type="number"
                  value={bundlePrice}
                  onChange={(e) => {
                    setBundlePrice(e.target.value);
                    setBundlePriceEdited(true);
                  }}
                  className="w-full mt-1 px-3 py-2"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={savingBundle || bundleComponents.length === 0}
                className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                style={{
                  background: "var(--color-secondary)",
                  color: "#fff",
                  borderRadius: "var(--radius-button)",
                  boxShadow: "var(--glow-shadow)",
                }}
              >
                {savingBundle ? "Saving..." : "Save Bundle"}
              </button>
            </form>
          </div>
        )}

        {/* ---- UNIVERSAL SCANNER MODAL ---- */}
        {showScanModal && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
            <div
              className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--glow-shadow)",
                borderWidth: "var(--border-width)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3
                  className="text-lg font-bold"
                  style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-heading)" }}
                >
                  🔍 Universal Scanner
                </h3>
                <button
                  onClick={closeScanModal}
                  className="text-xl leading-none hover:opacity-70"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ×
                </button>
              </div>

                            {/* Step 0: choose Photo vs File — the entry point every time the modal opens */}
              {!scanRows && scanMode === "choose" && (
                <>
                  <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
                    What do you want to scan?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setScanMode("photo")}
                      className="flex flex-col items-center justify-center p-6 text-center transition hover:opacity-90"
                      style={{
                        background: "var(--color-bg-secondary)",
                        borderRadius: "var(--radius-button)",
                        borderWidth: "var(--border-width)",
                        borderColor: "var(--color-primary)",
                      }}
                    >
                      <span className="text-3xl mb-2">📷</span>
                      <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        Scan Photo
                      </span>
                      <span className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                        Product box, price tag, or a physical item
                      </span>
                    </button>

                    <button
                      onClick={() => setScanMode("file")}
                      className="flex flex-col items-center justify-center p-6 text-center transition hover:opacity-90"
                      style={{
                        background: "var(--color-bg-secondary)",
                        borderRadius: "var(--radius-button)",
                        borderWidth: "var(--border-width)",
                        borderColor: "var(--color-border)",
                      }}
                    >
                      <span className="text-3xl mb-2">📄</span>
                      <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        Upload File
                      </span>
                      <span className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                        PDF, Word, Excel, or CSV
                      </span>
                    </button>
                  </div>
                </>
              )}

              {/* Step 1a: Photo mode — camera or image upload */}
              {!scanRows && scanMode === "photo" && (
                <>
                  <button
                    onClick={() => {
                      setScanMode("choose");
                      setScanFile(null);
                      setScanPreviewUrl(null);
                      setScanError("");
                    }}
                    className="text-xs mb-3 hover:underline"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    ← Back
                  </button>
                  <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
                    Take or upload a photo of a product box, price tag, or physical item.
                  </p>

                  <label
                    className="flex flex-col items-center justify-center p-6 mb-3 cursor-pointer text-center"
                    style={{
                      background: "var(--color-bg-secondary)",
                      borderRadius: "var(--radius-button)",
                      borderWidth: "2px",
                      borderStyle: "dashed",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleScanFileSelect}
                      className="hidden"
                    />
                    {scanPreviewUrl ? (
                      <img
                        src={scanPreviewUrl}
                        alt="Preview"
                        className="max-h-48 rounded-lg object-contain"
                      />
                    ) : (
                      <>
                        <span className="text-3xl mb-2">📷</span>
                        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                          Tap to take or choose a photo
                        </span>
                      </>
                    )}
                  </label>

                  {scanError && (
                    <p
                      className="text-sm p-2 rounded-lg mb-3"
                      style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.1)" }}
                    >
                      {scanError}
                    </p>
                  )}

                  <button
                    onClick={handleAnalyzeImage}
                    disabled={!scanFile || scanning}
                    className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                    style={{
                      background: "var(--gradient-accent)",
                      color: "#fff",
                      borderRadius: "var(--radius-button)",
                      boxShadow: "var(--glow-shadow)",
                    }}
                  >
                    {scanning ? "Analyzing..." : "Analyze Photo"}
                  </button>
                </>
              )}

              {/* Step 1b: File mode — PDF/Excel/CSV/Word upload */}
              {!scanRows && scanMode === "file" && (
                <>
                  <button
                    onClick={() => {
                      setScanMode("choose");
                      setScanFile(null);
                      setScanPreviewUrl(null);
                      setScanError("");
                    }}
                    className="text-xs mb-3 hover:underline"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    ← Back
                  </button>
                  <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
                    Upload a supplier receipt, invoice, or item list as a PDF, Word, Excel, or CSV file.
                  </p>

                  <label
                    className="flex flex-col items-center justify-center p-6 mb-3 cursor-pointer text-center"
                    style={{
                      background: "var(--color-bg-secondary)",
                      borderRadius: "var(--radius-button)",
                      borderWidth: "2px",
                      borderStyle: "dashed",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    <input
                      type="file"
                      accept=".pdf,.csv,.xlsx,.xls,.docx"
                      onChange={handleScanFileSelect}
                      className="hidden"
                    />
                    {scanFile ? (
                      <>
                        <span className="text-3xl mb-2">📄</span>
                        <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {scanFile.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl mb-2">📁</span>
                        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                          Tap to choose a PDF, Word, Excel, or CSV file
                        </span>
                      </>
                    )}
                  </label>

                  {scanError && (
                    <p
                      className="text-sm p-2 rounded-lg mb-3"
                      style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.1)" }}
                    >
                      {scanError}
                    </p>
                  )}

                  <button
                    onClick={handleAnalyzeImage}
                    disabled={!scanFile || scanning}
                    className="w-full font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                    style={{
                      background: "var(--gradient-accent)",
                      color: "#fff",
                      borderRadius: "var(--radius-button)",
                      boxShadow: "var(--glow-shadow)",
                    }}
                  >
                    {scanning ? "Analyzing..." : "Analyze File"}
                  </button>
                </>
              )}

              {/* Step 2a: exactly one item found — quick preview */}
              {scanRows && scanRows.length === 1 && (
                <>
                  {scanDocumentType && (
                    <p className="text-xs mb-2 font-medium" style={{ color: "var(--color-primary-light)" }}>
                      {documentTypeLabels[scanDocumentType]}
                    </p>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      Here's what the scanner found. Review it, then use it to fill in the item form.
                    </p>
                    <ConfidenceBadge confidence={scanRows[0].confidence} />
                  </div>

                  {(() => {
                    const row = scanRows[0];
                    const existingMatch = findPossibleExistingMatch(row);
                    return (
                      <>
                        {existingMatch && (
                          <p
                            className="text-xs p-2 rounded-lg mb-3"
                            style={{ color: "#facc15", background: "rgba(234, 179, 8, 0.1)" }}
                          >
                            ⚠️ This looks like an existing item: <strong>{existingMatch.name}</strong> (Stock: {existingMatch.stock}). Consider restocking it instead of creating a duplicate.
                          </p>
                        )}
                        <div
                          className="p-3 mb-4 space-y-1 text-sm"
                          style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-button)" }}
                        >
                          <p style={{ color: "var(--color-text-primary)" }}>
                            <strong>Name:</strong> {row.name || "—"}
                            {row.lowConfidenceFields.includes("name") && (
                              <span className="ml-2 text-xs" style={{ color: "#facc15" }}>
                                (verify)
                              </span>
                            )}
                          </p>
                          <p style={{ color: "var(--color-text-secondary)" }}>
                            <strong>Description:</strong> {row.description || "—"}
                          </p>
                          <p style={{ color: "var(--color-text-secondary)" }}>
                            <strong>Category:</strong> {row.category || "—"}
                            {row.subCategory ? ` / ${row.subCategory}` : ""}
                            {row.lowConfidenceFields.includes("category") && (
                              <span className="ml-2 text-xs" style={{ color: "#facc15" }}>
                                (verify)
                              </span>
                            )}
                          </p>
                          <p style={{ color: "var(--color-text-secondary)" }}>
                            <strong>Cost / Price:</strong> {row.unitCost || "—"} / {row.sellingPrice || "—"}
                            {(row.lowConfidenceFields.includes("unitCost") ||
                              row.lowConfidenceFields.includes("sellingPrice")) && (
                              <span className="ml-2 text-xs" style={{ color: "#facc15" }}>
                                (verify)
                              </span>
                            )}
                          </p>
                          {row.barcodeText && (
                            <p style={{ color: "var(--color-text-secondary)" }}>
                              <strong>Barcode:</strong> {row.barcodeText}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={openScanModal}
                            className="flex-1 font-semibold py-2.5 hover:opacity-90"
                            style={{
                              background: "var(--color-bg-secondary)",
                              color: "var(--color-text-secondary)",
                              borderRadius: "var(--radius-button)",
                            }}
                          >
                            Scan Again
                          </button>
                          <button
                            onClick={() => handleUseScanRowData(row)}
                            className="flex-1 font-semibold py-2.5 hover:opacity-90"
                            style={{
                              background: "var(--gradient-accent)",
                              color: "#fff",
                              borderRadius: "var(--radius-button)",
                              boxShadow: "var(--glow-shadow)",
                            }}
                          >
                            Use This Data
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}

              {/* Step 2b: multiple items (receipt/invoice/handwritten note) checklist */}
              {scanRows && scanRows.length > 1 && (
                <>
                  {scanDocumentType && (
                    <p className="text-xs mb-2 font-medium" style={{ color: "var(--color-primary-light)" }}>
                      {documentTypeLabels[scanDocumentType]}
                    </p>
                  )}
                  <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
                    Found {scanRows.length} item(s). Review and enter the quantity received for each before adding.
                  </p>

                  <div className="space-y-3 mb-4 max-h-96 overflow-y-auto pr-1">
                    {scanRows.map((row, i) => {
                      const existingMatch = findPossibleExistingMatch(row);
                      return (
                        <div
                          key={i}
                          className="p-3 space-y-2"
                          style={{
                            background: "var(--color-bg-secondary)",
                            borderRadius: "var(--radius-button)",
                            opacity: row.selected ? 1 : 0.5,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(e) => updateScanRow(i, "selected", e.target.checked)}
                            />
                            <input
                              value={row.name}
                              onChange={(e) => updateScanRow(i, "name", e.target.value)}
                              className="flex-1 px-2 py-1 text-sm font-medium"
                              style={fieldHighlightStyle("name", row)}
                              placeholder="Item name"
                            />
                            <ConfidenceBadge confidence={row.confidence} />
                          </div>

                          {existingMatch && (
                            <p className="text-xs" style={{ color: "#facc15" }}>
                              ⚠️ Matches existing item "{existingMatch.name}" (Stock: {existingMatch.stock}) — consider restocking instead.
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={row.category}
                              onChange={(e) => updateScanRow(i, "category", e.target.value)}
                              className="px-2 py-1 text-xs"
                              style={fieldHighlightStyle("category", row)}
                              placeholder="Category"
                            />
                            <input
                              value={row.subCategory}
                              onChange={(e) => updateScanRow(i, "subCategory", e.target.value)}
                              className="px-2 py-1 text-xs"
                              style={fieldHighlightStyle("subCategory", row)}
                              placeholder="Sub-category"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="number"
                              value={row.unitCost}
                              onChange={(e) => updateScanRow(i, "unitCost", e.target.value)}
                              className="px-2 py-1 text-xs"
                              style={fieldHighlightStyle("unitCost", row)}
                              placeholder="Cost ₱"
                            />
                            <input
                              type="number"
                              value={row.sellingPrice}
                              onChange={(e) => updateScanRow(i, "sellingPrice", e.target.value)}
                              className="px-2 py-1 text-xs"
                              style={fieldHighlightStyle("sellingPrice", row)}
                              placeholder="Price ₱"
                            />
                            <input
                              type="number"
                              required={row.selected}
                              value={row.quantity}
                              onChange={(e) => updateScanRow(i, "quantity", e.target.value)}
                              className="px-2 py-1 text-xs font-semibold"
                              style={{
                                ...inputStyle,
                                background: "var(--color-surface)",
                                borderColor: "var(--color-primary)",
                              }}
                              placeholder="Qty *"
                            />
                          </div>
                          {row.barcodeText && (
                            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                              Barcode: {row.barcodeText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {bulkMessage && (
                    <p
                      className="text-sm p-2 rounded-lg mb-3"
                      style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.1)" }}
                    >
                      {bulkMessage}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={openScanModal}
                      className="flex-1 font-semibold py-2.5 hover:opacity-90"
                      style={{
                        background: "var(--color-bg-secondary)",
                        color: "var(--color-text-secondary)",
                        borderRadius: "var(--radius-button)",
                      }}
                    >
                      Scan Again
                    </button>
                    <button
                      onClick={handleBulkAddItems}
                      disabled={addingBulk}
                      className="flex-1 font-semibold py-2.5 disabled:opacity-50 hover:opacity-90"
                      style={{
                        background: "var(--gradient-accent)",
                        color: "#fff",
                        borderRadius: "var(--radius-button)",
                        boxShadow: "var(--glow-shadow)",
                      }}
                    >
                      {addingBulk ? "Adding..." : "Add Selected to Inventory"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}




        {/* ---- PHOTO LIGHTBOX ---- */}
{viewingPhoto && (
  <div
    className="fixed inset-0 bg-black/85 flex items-center justify-center z-[60] p-4"
    onClick={() => setViewingPhoto(null)}
  >
    <button
      onClick={() => setViewingPhoto(null)}
      className="absolute top-4 right-4 text-3xl leading-none hover:opacity-70"
      style={{ color: "#fff" }}
    >
      ×
    </button>
    <img
      src={viewingPhoto}
      alt="Item photo"
      className="max-w-full max-h-[85vh] rounded-lg object-contain"
      onClick={(e) => e.stopPropagation()}
      style={{ boxShadow: "var(--glow-shadow)" }}
    />
  </div>
)}



      </main>
    </div>
  );
} 