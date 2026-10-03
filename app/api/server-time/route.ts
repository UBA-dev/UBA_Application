import { NextResponse } from "next/server";

// The Daily Register dates every cashier day by this clock instead of the
// phone's, so changing the phone's date can't skip or reopen a business day.
// POST so neither Next.js nor the service worker ever serves a cached time.
export async function POST() {
  return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
