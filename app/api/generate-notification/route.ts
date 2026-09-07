import { NextResponse } from "next/server";
import { db } from "@/app/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export async function GET() {
  try {
    const querySnapshot = await getDocs(collection(db, "inventory"));
    const lowStockItems: {
      id: string;
      name: string;
      stock: number;
      minStock: number;
      suggestedOrder: number;
      supplier: string;
    }[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const stock = Number(data.stock ?? data.quantity ?? 0);
      const minStock = Number(data.minStock ?? data.minQuantity ?? 5);

      if (stock <= minStock) {
        lowStockItems.push({
          id: doc.id,
          name: data.name || data.itemName || "Unnamed Item",
          stock,
          minStock,
          suggestedOrder: Math.max(minStock * 2 - stock, 10),
          supplier: data.supplier || "N/A",
        });
      }
    });

    if (lowStockItems.length === 0) {
      return NextResponse.json({
        hasNotification: false,
        count: 0,
        message: "All inventory stocks are healthy.",
        items: [],
      });
    }

    const itemNames = lowStockItems.map((i) => i.name).join(", ");
    const notification = {
      hasNotification: true,
      title: "⚠️ Low Stock Alert",
      count: lowStockItems.length,
      message: `${lowStockItems.length} item(s) need reordering immediately: ${itemNames}.`,
      items: lowStockItems,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(notification);
  } catch (error) {
    console.error("Error generating notification:", error);
    return NextResponse.json(
      { error: "Failed to generate notification" },
      { status: 500 }
    );
  }
}