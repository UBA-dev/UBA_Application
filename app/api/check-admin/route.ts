import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../lib/apiAuth";

// Paste the exact UID from the Firebase Authentication Console here
const ADMIN_UID = "hQYa5p6kpnfHj8oFneud3eLxYPx2";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (!auth.ok) return NextResponse.json({ isAdmin: false }, { status: 401 });

    const isAdmin = !auth.session.isStaff && auth.session.uid === ADMIN_UID;
    return NextResponse.json({ isAdmin });
  } catch (error) {
    return NextResponse.json({ isAdmin: false }, { status: 500 });
  }
}
