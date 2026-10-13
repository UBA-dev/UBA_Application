// This browser's identity for Owner device protection (see ownerSecurity.ts).
// A random id kept in localStorage — not a fingerprint, no personal data.
// Clearing site data makes the browser a "new device" that needs a code.

const KEY = "uba-device-id";
const VALID = /^[A-Za-z0-9-]{20,64}$/;
let memoryId: string | null = null;

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !VALID.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): stable for this tab only.
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}

// Same hash the server stores (hashDeviceId in ownerSecurity.ts).
export async function hashDeviceId(deviceId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`uba-device:${deviceId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// "Chrome on Android", "Safari on iPhone", "Edge on Windows"…
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
    ? "Opera"
    : /SamsungBrowser/.test(ua)
    ? "Samsung Internet"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
    ? "iPad"
    : /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
    ? "Mac"
    : /Linux/.test(ua)
    ? "Linux"
    : "device";
  const app = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches ? " (app)" : "";
  return `${browser} on ${os}${app}`;
}
