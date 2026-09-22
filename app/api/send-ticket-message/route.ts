import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../lib/firebaseAdmin";
import { requireSession } from "../../lib/apiAuth";
import { sendSms } from "../../lib/semaphore";

const TICKET_COLLECTIONS: Record<string, string> = {
  repair: "repairTickets",
  delivery: "deliveryTickets",
  po: "poTickets",
};

const PHONE_FIELDS: Record<string, string> = {
  repair: "customerPhone",
  delivery: "customerPhone",
  po: "buyerContact",
};

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (!auth.ok) return auth.response;
    const { tenantId, role } = auth.session;

    // Same access level as the ticket pages themselves — Owner and
    // Secretary only, never Cashier.
    if (role === "cashier") {
      return NextResponse.json({ error: "This feature isn't available for your role." }, { status: 403 });
    }

    const { ticketType, ticketId, message } = await req.json();

    const collectionName = TICKET_COLLECTIONS[ticketType];
    const phoneField = PHONE_FIELDS[ticketType];
    if (!collectionName || !ticketId || !message?.trim()) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // The phone number always comes from the ticket record itself, never
    // from the request body — otherwise a tampered request could be used
    // to blast SMS to any number on the Owner's Semaphore balance.
    const ticketRef = adminDb.collection("tenants").doc(tenantId).collection(collectionName).doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }
    const ticket = ticketSnap.data();
    const phone = ticket?.[phoneField];
    if (!phone) {
      return NextResponse.json({ error: "No contact number saved on this ticket." }, { status: 400 });
    }

    const result = await sendSms(phone, message);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    await ticketRef.update({
      lastMessageSentAt: new Date().toISOString(),
      lastMessageSentText: message,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-ticket-message error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
