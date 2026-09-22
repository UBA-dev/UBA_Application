import { auth } from "./firebase";

// A drop-in replacement for fetch() that attaches the signed-in user's
// Firebase ID token as a Bearer Authorization header. Use this for every
// call to an API route that checks requireSession/requireOwnerSession
// (see apiAuth.ts) — a plain fetch() has no way to prove who's calling,
// which is how the AI routes used to be callable, and billable, by anyone
// who knew the URL.
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not logged in");
  }

  const token = await user.getIdToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers });
}
