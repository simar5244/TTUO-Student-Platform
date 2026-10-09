import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms & Conditions" };

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-sm font-bold uppercase tracking-wide">{children}</h2>;
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="text-xs text-mute underline underline-offset-2">← Back</Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Terms &amp; Conditions and Privacy Notice</h1>
      <p className="mt-1 text-xs text-mute">Last updated: {new Date().toISOString().slice(0, 10)}</p>

      <div className="mt-6 space-y-3 text-sm leading-relaxed text-ink/90">
        <p className="rounded-lg border border-line bg-smoke/50 p-4 text-sm">
          <strong>Important — please read first.</strong> This application ("the Portal") is an independent,
          third-party tool built to help applicants to Texas Tech University Online programs track their
          admissions journey. <strong>The Portal is not an official Texas Tech University product</strong>, is not
          operated by Texas Tech University, Texas Tech University System, or any affiliated institution, and is
          not endorsed by or affiliated with them. Official admission decisions, records, and requirements are
          made solely by Texas Tech University through its official systems, including Salesforce / RaiderConnect.
        </p>

        <H>1. What this service is</H>
        <p>
          The Portal provides a status dashboard, document upload, checklist tracking, and messaging for
          applicants. It periodically reads a copy of admissions-related data so you can see your progress in
          one place. The Portal does not make admission decisions, does not submit applications on your behalf,
          and does not modify your official university record. Your official application remains in Texas Tech's
          systems (Salesforce / RaiderConnect).
        </p>

        <H>2. What we collect — and what we deliberately don't</H>
        <p>
          We follow a <strong>minimal-footprint principle</strong>: we collect only what the service needs to
          function, nothing more. Specifically:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account data:</strong> your first name, last name, email address, and mobile phone number —
            used to create your account, verify your identity, and match your portal account to your application.</li>
          <li><strong>Security data:</strong> a one-way hashed password (we never store your actual password),
            login timestamps, and IP address / device user-agent for abuse prevention and audit logging.</li>
          <li><strong>Application status data:</strong> your application status, term, program, checklist items
            and their completion state — read from a synchronized copy of admissions data, shown to you for
            convenience only.</li>
          <li><strong>Documents you upload:</strong> files you choose to submit (e.g., transcripts, IDs). Uploads
            are encrypted at rest, access-logged, and visible only to you and authorized staff reviewing your
            application.</li>
          <li><strong>Chat and activity:</strong> messages you send through the portal and basic activity events
            (page actions, uploads, status checks) needed to operate the service and maintain an audit trail.</li>
        </ul>
        <p>
          <strong>We do not collect:</strong> Social Security numbers, payment card numbers, bank details,
          biometric data, precise geolocation, contacts lists, or data from your device unrelated to the portal.
          Do not include such information in documents or messages unless specifically required for admission
          through official channels.
        </p>

        <H>3. How your information is used</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>To operate your account and show you your application/checklist status.</li>
          <li>To match your portal account to your existing application record (performed with a confidence-scored
            process; uncertain matches are reviewed by a human before they are confirmed).</li>
          <li>To let authorized staff review documents you submit and relay them into the official admissions
            system where required.</li>
          <li>To maintain security, prevent abuse, and keep an audit trail of account activity.</li>
        </ul>
        <p>
          We do not sell your data, do not use it for advertising, and do not share it with third parties other
          than the infrastructure providers that run the service and the university's official systems where your
          application actually lives.
        </p>

        <H>4. SMS / phone consent</H>
        <p>
          By providing a mobile number and creating an account, you consent to receive SMS messages related to
          your account — primarily verification codes required to sign in. Message and data rates may apply.
          Consent to SMS is a condition of using the service because verification protects your record; if you
          do not wish to receive SMS, do not create an account.
        </p>

        <H>5. Data synchronization and accuracy</H>
        <p>
          Application and checklist data shown in the Portal is copied from official systems on a schedule
          (typically every 15 minutes, upstream refreshes up to several hours). There is always a delay: the
          Portal may show a status that is already newer in RaiderConnect, or vice-versa. <strong>When the Portal
          and official systems disagree, the official system is authoritative.</strong> Always confirm critical
          deadlines, requirements, and decisions through official university communications.
        </p>

        <H>6. Documents you submit</H>
        <p>
          Uploads are marked <em>pending review</em> until staff verify them. Staff may then enter them into the
          official admissions system on your behalf; the Portal marks them approved only after the official
          record reflects receipt. The Portal is a convenience channel — if you need guaranteed delivery or have
          a hard deadline, submit through the official admissions system and use the Portal to track.
        </p>

        <H>7. Retention and deletion</H>
        <p>
          Account and activity data is retained while your account is active and for a reasonable period after
          for audit and security purposes. To request deletion of your portal account and locally-held data,
          contact us at the address below. Note that deleting your portal account does not affect your official
          university record, which is governed by Texas Tech's own retention policies.
        </p>

        <H>8. Security</H>
        <p>
          We use industry-reasonable safeguards: hashed passwords, encrypted document storage, role-based access
          for staff, audit logging, and access controls. No internet service can guarantee absolute security.
          You are responsible for keeping your password confidential and for completing sign-out on shared
          devices. Notify us promptly if you believe your account has been accessed without authorization.
        </p>

        <H>9. Acceptable use</H>
        <p>
          You agree to provide accurate information, to only upload documents you are entitled to share, and not
          to attempt to access other users' records, probe or disrupt the service, or misrepresent your identity.
          Accounts used in violation of these terms may be suspended.
        </p>

        <H>10. No warranties; limitation of liability</H>
        <p>
          THE PORTAL IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
          INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
          We do not warrant that the service will be uninterrupted, timely, error-free, or that displayed status
          information will always be current. To the maximum extent permitted by law, the operators of this Portal
          shall not be liable for any indirect, incidental, consequential, or punitive damages — including missed
          deadlines, admission decisions, or reliance on displayed statuses — arising from use of or inability to
          use the service. Nothing in this section limits liability that cannot lawfully be limited.
        </p>

        <H>11. Relationship to Texas Tech</H>
        <p>
          This Portal is a third-party convenience tool. It is <strong>not</strong> an official Texas Tech
          University website or service, is not maintained by TTU IT, and TTU bears no responsibility for its
          content or availability. Questions about your actual application, admission status, or requirements
          should always be directed to Texas Tech University through official channels.
        </p>

        <H>12. Changes to these terms</H>
        <p>
          We may update these terms from time to time; the "last updated" date at the top reflects the current
          version. Material changes will be noted on this page. Continued use after changes constitutes
          acceptance.
        </p>

        <H>13. Contact</H>
        <p>
          Questions about these terms, your data, or the service: contact the portal administrator through the
          messaging feature in your account or at the address provided by your program coordinator.
        </p>

        <p className="mt-8 rounded-lg border border-line p-4 text-xs text-mute">
          These terms were drafted for a small third-party admissions-tracking tool and are provided for
          transparency. They are not legal advice and should be reviewed by qualified counsel before relying on
          them in any dispute.
        </p>
      </div>
    </main>
  );
}
