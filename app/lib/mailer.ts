// Sends email through a Gmail account using a Google "App Password" — free
// (about 500 emails a day), no domain or paid email service needed.
//
// Set on Vercel (and in .env.local for local testing):
//   GMAIL_USER          the Gmail address that sends, e.g. uba.notify@gmail.com
//   GMAIL_APP_PASSWORD  a 16-character App Password for that account
//                       (Google Account → Security → 2-Step Verification →
//                        App passwords)
//
// Until both are set, sendEmail() returns a clear "not set up" error instead
// of crashing the route that calls it.

import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  transporter ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  return transporter;
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const mail = getTransporter();
  if (!mail) {
    return { ok: false, error: "Email sending isn't set up yet. Contact your UBA provider." };
  }
  try {
    await mail.sendMail({
      from: `"UBA" <${process.env.GMAIL_USER}>`,
      ...message,
    });
    return { ok: true };
  } catch (err) {
    console.error("Gmail send failed:", err);
    return { ok: false, error: "Couldn't send the email. Try again shortly." };
  }
}
