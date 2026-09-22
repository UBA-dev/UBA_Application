// Sends SMS via Semaphore (semaphore.co) — a Philippines-focused SMS
// gateway. Requires SEMAPHORE_API_KEY (the Owner's own account/credits,
// separate from UBA's Gemini/Resend costs). Until that key is set,
// sendSms() returns a clear "not set up" error instead of silently
// failing or crashing the route that calls it.

const SEMAPHORE_URL = "https://api.semaphore.co/api/v4/messages";

// Semaphore expects the local PH format (09XXXXXXXXX), not the
// +63XXXXXXXXXX format the rest of the app stores phone numbers in.
function toLocalFormat(e164: string): string {
  return e164.startsWith("+63") ? "0" + e164.slice(3) : e164;
}

export async function sendSms(
  toPhone: string,
  message: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "SMS sending isn't set up yet. Contact your UBA provider." };
  }

  const number = toLocalFormat(toPhone);

  try {
    const res = await fetch(SEMAPHORE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ apikey: apiKey, number, message }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Semaphore SMS error:", res.status, errText);
      return { ok: false, error: "Couldn't send the text message. Try again shortly." };
    }

    return { ok: true };
  } catch (err) {
    console.error("Semaphore SMS request failed:", err);
    return { ok: false, error: "Couldn't send the text message. Try again shortly." };
  }
}
