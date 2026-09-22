// Central place for which Gemini model the app calls, and a shared retry
// wrapper for calling it. Switching models later means editing this one
// line instead of hunting through every API route.
//
// gemini-3.1-flash-lite was picked after directly comparing it against
// gemini-3.6-flash on this app's real prompts: lite was consistently
// 2-5x faster (2-5s vs 4-17s) and matched or beat 3.6-flash's answer
// quality on both an image-reading task and a business-insight task,
// while 3.6-flash also failed outright (503 "high demand") on 2 of 3
// back-to-back attempts during testing.
export const GEMINI_MODEL = "gemini-3.1-flash-lite";

export function geminiUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

// Retries on transient failures only — 503 (Google's servers are
// overloaded) and 429 (rate limited) typically clear up within a couple
// of seconds. Anything else (bad request, invalid key, etc.) is returned
// immediately since retrying the same broken request won't help.
export async function fetchGeminiWithRetry(
  url: string,
  body: unknown,
  maxRetries = 2
): Promise<Response> {
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.ok || attempt >= maxRetries) return response;
    if (response.status !== 503 && response.status !== 429) return response;

    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }
}
