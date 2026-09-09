import { NextRequest, NextResponse } from "next/server";

// I-paste dito ang eksaktong UID mula sa Firebase Authentication Console
const ADMIN_UID = "hQYa5p6kpnfHj8oFneud3eLxYPx2"; 

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ isAdmin: false }, { status: 400 });
    }

    const isAdmin = userId === ADMIN_UID;

    return NextResponse.json({ isAdmin });
  } catch (error) {
    return NextResponse.json({ isAdmin: false }, { status: 500 });
  }
}