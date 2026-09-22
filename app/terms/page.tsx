"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-800 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to UBA
        </Link>

        <h1 className="text-2xl font-bold mt-4 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: September 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold text-base mb-1">1. What UBA Is</h2>
            <p>
              UBA (Universal Business Assistant) is a business management application for small
              retail and repair shops, providing inventory management, point-of-sale, sales
              tracking, repair ticket management, and optional UBA smart features (scanning,
              business analysis, and a chat assistant).
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">2. Accounts</h2>
            <p>
              Each account is tied to one business ("shop"). Your business data — inventory,
              sales, expenses, repair tickets, and related records — is stored separately from
              every other UBA customer and is not shared or visible to other users.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">3. Plans, Billing, and Refunds</h2>
            <p>
              <strong>Plans.</strong> UBA offers three paid plans — Basic, Pro, and Business —
              each with different limits on staff logins, UBA usage, and features such as Repair,
              Delivery, and P.O. Tickets. Current prices and what's included in each plan are
              shown on the Pricing page inside the app. New accounts get a 14-day free trial with
              full access before choosing a plan.
            </p>
            <p className="mt-2">
              <strong>Free plan.</strong> If your trial ends or a plan is not renewed, your
              account is not locked. It moves to a Free plan: your data stays safe, and core
              tools (POS, Inventory, Sales & Expenses) keep working, limited to 50 inventory
              items. Staff logins, UBA features, and Tickets are not available on the Free plan.
            </p>
            <p className="mt-2">
              <strong>Billing.</strong> You can pay monthly or annually (annual plans cost 25%
              less — 9 months' price for 12 months of use). Payment is currently handled
              manually: you send payment through the method shown on the Pricing page (such as
              GCash), and your plan is activated within 1 business day after your payment is
              verified. Plans do not auto-renew — monthly plans need to be paid again each month
              to stay active, and we'll remind you before an annual plan is about to expire.
            </p>
            <p className="mt-2">
              <strong>Refunds.</strong> Annual plans can be refunded within 14 days of payment.
              Monthly plans are not refundable once the plan has been activated for that period.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">4. UBA Features & Usage Limits</h2>
            <p>
              UBA's smart features send relevant business data (e.g. item descriptions, sales
              summaries, uploaded photos or documents) to third-party AI providers (Google
              Gemini) to generate results. Content generated this way (item details, business
              insights, draft customer messages) should be reviewed before relying on it — it
              may occasionally be inaccurate. These features are subject to reasonable monthly
              usage limits to prevent abuse.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">5. Your Data</h2>
            <p>
              You own the business data you enter into UBA. You are responsible for the accuracy
              of the data you input and for any customer information (such as names and phone
              numbers) you record through the Repair Tickets feature — you are responsible for
              having the appropriate basis to collect and use that information under applicable
              law.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">6. Acceptable Use</h2>
            <p>
              You agree not to attempt to access other tenants' data, share your account across
              multiple unrelated businesses, or use the service for unlawful purposes.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">7. Availability & Limitation of Liability</h2>
            <p>
              UBA is provided "as is." While reasonable efforts are made to keep the service
              available and your data safe, UBA and its provider are not liable for lost profits,
              data loss, or business interruption arising from use of the service, to the fullest
              extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">8. Termination</h2>
            <p>
              Either party may discontinue use of the service. Upon termination, your data may be
              retained for a reasonable period and then deleted, unless otherwise agreed.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">9. Governing Law</h2>
            <p>These terms are governed by the laws of the Republic of the Philippines.</p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">10. Contact</h2>
            <p>
              Questions about these terms can be directed to your UBA provider through the
              contact details they gave you at onboarding.
            </p>
          </section>
        </div>

        <p className="text-xs text-gray-400 mt-10">
          See also our{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}