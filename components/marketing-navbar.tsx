import Link from "next/link";
import { StackSenseLogo } from "@/components/stacksense-logo";

export const MARKETING_NAV_ITEMS = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Agents", href: "/#agents" },
  { label: "About", href: "/about" },
] as const;

export function MarketingLogoLink() {
  return (
    <Link href="/" className="flex items-center no-underline text-inherit">
      <StackSenseLogo />
    </Link>
  );
}

/** Same chrome as the landing page header — logo, anchors, primary CTA */
export function MarketingNavbar() {
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-[rgba(50,95,87,0.2)] bg-[rgba(4,21,26,0.85)] backdrop-blur-[16px]">
      <div className="mx-auto max-w-7xl px-8">
        <div className="flex h-16 items-center justify-between">
          <MarketingLogoLink />

          <div className="hidden items-center gap-10 md:flex">
            {MARKETING_NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="font-sans text-[15px] text-[#c4ddd5] transition-colors hover:text-[#ffffff]"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <Link
            href="/dashboard"
            className="rounded-md bg-[#325F57] px-6 py-2.5 font-sans text-[14px] font-semibold text-[#04151A] transition-colors hover:bg-[#7ab8a4]"
          >
            Get started free &rarr;
          </Link>
        </div>
      </div>
    </nav>
  );
}
