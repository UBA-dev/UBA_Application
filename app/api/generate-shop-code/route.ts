import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/app/lib/firebaseAdmin";
import { requireOwnerSession } from "@/app/lib/apiAuth";

// Hindi kasama ang mga letra na madaling mapagkamalan (0/O, 1/I)
const SHOP_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateShopCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SHOP_CODE_CHARS[Math.floor(Math.random() * SHOP_CODE_CHARS.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOwnerSession(req);
    if (!auth.ok) return auth.response;

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateShopCode();
      const existing = await adminDb
        .collection("tenants")
        .where("shopCode", "==", code)
        .limit(1)
        .get();
      if (existing.empty) {
        return NextResponse.json({ shopCode: code });
      }
    }

    return NextResponse.json({ error: "Could not generate a unique shop code. Try again." }, { status: 500 });
  } catch (err: any) {
    console.error("generate-shop-code error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}