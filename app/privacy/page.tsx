import Link from "next/link";
import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing-navbar";

export const metadata: Metadata = {
  title: "Privacy · StackSense",
  description:
    "How StackSense handles GitHub repository URLs and analysis. No accounts required; read-only GitHub access; results are not stored.",
};

const delay = [
  "stacksense-legal-enter-d0",
  "stacksense-legal-enter-d1",
  "stacksense-legal-enter-d2",
  "stacksense-legal-enter-d3",
  "stacksense-legal-enter-d4",
  "stacksense-legal-enter-d5",
  "stacksense-legal-enter-d6",
  "stacksense-legal-enter-d7",
  "stacksense-legal-enter-d8",
  "stacksense-legal-enter-d9",
] as const;

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#04151A]">
      <MarketingNavbar />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-14 z-0 h-[min(52vh,420px)] bg-[radial-gradient(ellipse_at_50%_0%,rgba(50,95,87,0.14)_0%,transparent_58%)]"
      />

      <main className="relative z-10 mx-auto max-w-3xl px-8 pb-32 pt-[7.25rem]">
        <div
          className={`stacksense-legal-enter ${delay[0]} mb-6 inline-flex rounded-full border border-[rgba(94,180,154,0.35)] bg-[rgba(50,95,87,0.14)] px-3 py-1 font-mono text-[11px] tracking-[0.08em] text-[#5ca68a]`}
        >
          PRIVACY
        </div>

        <h1
          className={`stacksense-legal-enter ${delay[1]} font-serif text-[clamp(40px,6vw,56px)] font-normal leading-[1.05] tracking-tight text-[#ffffff]`}
        >
          Privacy policy
        </h1>

        <p
          className={`stacksense-legal-enter ${delay[2]} mt-6 max-w-[560px] font-sans text-[17px] leading-[1.8] text-[#b8d4c8]`}
        >
          Last updated: January 2026. This describes what we collect when you use StackSense and how we
          treat your information.
        </p>

        <div className="mt-16 flex flex-col gap-8 md:gap-10">
          <section
            className={`stacksense-legal-enter ${delay[3]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              What we collect
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <ul className="mt-6 list-disc space-y-3 pl-5 font-sans text-[17px] leading-[1.8] text-[#b8d4c8] marker:text-[#7ab8a4]">
              <li>
                <span className="text-[#e8f0ed] font-semibold">GitHub repository URLs</span> that you enter
                when you request an analysis (for example, a public repo link you paste into the product).
              </li>
            </ul>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[4]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              What we do not collect
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <ul className="mt-6 list-disc space-y-3 pl-5 font-sans text-[17px] leading-[1.8] text-[#b8d4c8] marker:text-[#7ab8a4]">
              <li>No user accounts are required to use StackSense as described.</li>
              <li>We do not store your repository source code as a persistent archive on our side.</li>
              <li>We do not ask for personal data such as name, email, or billing details for basic analysis.</li>
            </ul>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[5]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              GitHub access
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              When we access GitHub on your behalf, we use{' '}
              <span className="font-semibold text-[#e8f0ed]">read-only</span> API access to inspect public
              repository metadata and file content needed to run the scan. We do not use this access to modify
              your repositories.
            </p>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[6]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              Analysis results
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              <span className="font-semibold text-[#e8f0ed]">Analysis results are not stored</span> by us as
              a long-term database of your scans. Outputs are meant for your immediate session and reporting
              experience in the product.
            </p>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[7]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              AI processing (Groq)
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              We use the <span className="font-semibold text-[#e8f0ed]">Groq</span> API to process analysis
              payloads (for example, summarizing findings). Groq operates under its own privacy and data
              practices. StackSense{' '}
              <span className="font-semibold text-[#e8f0ed]">
                does not retain that analysis payload as a persistent record on our servers
              </span>
              ; retention and handling by the model provider follow Groq&apos;s policies.
            </p>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[8]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              Contact
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              For privacy questions about StackSense, use the contact options published on our site when
              available.
            </p>
          </section>

          <div className={`stacksense-legal-enter ${delay[9]} mt-8 flex justify-center pt-6 md:justify-start`}>
            <Link
              href="/"
              className="inline-flex rounded-md bg-[#325F57] px-8 py-3.5 font-sans text-[15px] font-semibold text-[#04151A] transition-colors hover:bg-[#7ab8a4]"
            >
              &larr; Back to home
            </Link>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-[#163E3C] bg-[#092828] px-8 py-5">
        <div className="mx-auto flex max-w-3xl justify-between font-mono text-[11px] text-[#7ab8a4]">
          <span>&copy; 2026 StackSense</span>
          <span>Made with Meta Llama · Groq API</span>
        </div>
      </footer>
    </div>
  );
}
