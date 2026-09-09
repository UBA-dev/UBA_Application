"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-800 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to UBA
        </Link>

        <h1 className="text-2xl font-bold mt-4 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: September 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold text-base mb-1">1. What We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account information: your email address and business name.</li>
              <li>
                Business data you enter: inventory items, sales records, expenses, and repair
                ticket details.
              </li>
              <li>
                Customer information you choose to record through Repair Tickets: customer name
                and contact number, used solely to help you manage repairs and notify customers.
              </li>
              <li>
                Photos or documents you upload to the Scanner feature, processed to extract
                inventory information.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">2. How We Use It</h2>
            <p>
              Your data is used solely to operate UBA for your business — displaying your
              inventory, generating reports, processing sales, and powering optional AI features
              you choose to use. We do not sell your data or share it with other businesses using
              UBA.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">3. Third-Party Services</h2>
            <p>UBA relies on the following third-party services to operate:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>
                <strong>Google Firebase</strong> — stores your account and business data.
              </li>
              <li>
                <strong>Google Gemini API</strong> — processes data you submit to AI features
                (Scanner, Business Analyst, Assistant) to generate results.
              </li>
              <li>
                <strong>Resend</strong> — sends automated low-stock email alerts to your
                registered email.
              </li>
            </ul>
            <p className="mt-2">
              These providers process data according to their own privacy and security practices.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">4. Data Isolation & Security</h2>
            <p>
              Each business's data is stored separately and protected by access rules that only
              allow the account owner (and, for support purposes, the UBA administrator) to read
              or modify it. No other UBA customer can access your data.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">5. Data Retention</h2>
            <p>
              Your data is retained for as long as your account remains active. If you discontinue
              use of UBA, you may request deletion of your data by contacting your UBA provider.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">6. Your Rights</h2>
            <p>
              Under the Philippine Data Privacy Act (RA 10173), you have the right to access,
              correct, or request deletion of your personal data. Contact your UBA provider to
              exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">7. Changes to This Policy</h2>
            <p>
              This policy may be updated as UBA's features evolve. Continued use of the service
              after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">8. Contact</h2>
            <p>
              Questions about this policy or your data can be directed to your UBA provider
              through the contact details they gave you at onboarding.
            </p>
          </section>
        </div>

        <p className="text-xs text-gray-400 mt-10">
          See also our{" "}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </div>
  );
}