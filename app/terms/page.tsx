import Link from "next/link";
import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing-navbar";

export const metadata: Metadata = {
  title: "Terms of use · StackSense",
  description:
    "Terms for using StackSense: free AI codebase analysis, public repos, read-only access, no warranties.",
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

export default function TermsPage() {
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
          LEGAL
        </div>

        <h1
          className={`stacksense-legal-enter ${delay[1]} font-serif text-[clamp(40px,6vw,56px)] font-normal leading-[1.05] tracking-tight text-[#ffffff]`}
        >
          Terms of use
        </h1>

        <p
          className={`stacksense-legal-enter ${delay[2]} mt-6 max-w-[560px] font-sans text-[17px] leading-[1.8] text-[#b8d4c8]`}
        >
          Last updated: January 2026. By using StackSense, you agree to the following terms.
        </p>

        <div className="mt-16 flex flex-col gap-8 md:gap-10">
          <section
            className={`stacksense-legal-enter ${delay[3]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              The service
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              StackSense is a{' '}
              <span className="font-semibold text-[#e8f0ed]">free, AI-powered codebase analysis tool</span>{' '}
              that helps you explore security, dependency, and quality signals about software projects. It is
              provided as-is for informational purposes.
            </p>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[4]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              GitHub access
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              StackSense uses <span className="font-semibold text-[#e8f0ed]">read-only</span> access to{' '}
              <span className="font-semibold text-[#e8f0ed]">public GitHub repositories only</span> for the
              URLs you submit. You are responsible for ensuring you have the right to analyze any repository
              you submit.
            </p>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[5]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              AI-generated results
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              Findings and scores are{' '}
              <span className="font-semibold text-[#e8f0ed]">
                AI-generated estimates and are not guaranteed to be accurate, complete, or up to date
              </span>
              . They do not constitute professional security, legal, or compliance advice. Always verify
              critical issues independently.
            </p>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[6]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              Limitation of reliance
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              StackSense and its operators{' '}
              <span className="font-semibold text-[#e8f0ed]">
                are not responsible for any decisions or actions you take based on analysis results
              </span>
              , including remediation, deployments, audits, or disclosures. Use of the output is at your sole
              risk.
            </p>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[7]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              No warranty
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              The service is provided &quot;as is&quot; without warranties of any kind, whether express or implied,
              including implied warranties of merchantability, fitness for a particular purpose, or
              non-infringement. To the maximum extent permitted by law, StackSense and its contributors{" "}
              <span className="font-semibold text-[#e8f0ed]">disclaim all liability</span> for any indirect,
              incidental, special, consequential, or punitive damages, or any loss of data, profits, or goodwill,
              arising out of or in connection with your use of the service.
            </p>
          </section>

          <section
            className={`stacksense-legal-enter ${delay[8]} stacksense-legal-panel px-6 py-8 md:px-9 md:py-10`}
          >
            <h2 className="font-serif text-[clamp(26px,3.8vw,34px)] font-normal leading-[1.15] text-[#ffffff]">
              Changes to the service
            </h2>
            <div className="mt-6 h-px w-full bg-[linear-gradient(90deg,rgba(50,95,87,0.55),transparent)]" />
            <p className="mt-6 font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
              StackSense may{' '}
              <span className="font-semibold text-[#e8f0ed]">
                change, suspend, or discontinue the service or these terms at any time
              </span>{' '}
              without prior notice. Continued use after changes constitutes acceptance of the updated terms
              where applicable.
            </p>
          </section>

          <div
            className={`stacksense-legal-enter ${delay[9]} mt-8 flex justify-center pt-6 md:justify-start`}
          >
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
