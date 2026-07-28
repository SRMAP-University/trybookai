"use client";

import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { cn } from "@/lib/utils";

type LegalClickAgreementProps = {
  className?: string;
  /** e.g. "By creating an account" / "By continuing" / "By starting a subscription" */
  actionLabel?: string;
};

/** Small implied-consent notice — clicking the CTA means they agree. */
export function LegalClickAgreement({
  className,
  actionLabel = "By continuing",
}: LegalClickAgreementProps) {
  return (
    <p className={cn("text-[10px] leading-snug text-[#8b95a5]", className)}>
      {actionLabel}, you agree to our{" "}
      <Link
        href={LEGAL.terms}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#635bff] hover:underline"
      >
        Terms
      </Link>
      ,{" "}
      <Link
        href={LEGAL.privacy}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#635bff] hover:underline"
      >
        Privacy Policy
      </Link>
      , and{" "}
      <Link
        href={LEGAL.refund}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#635bff] hover:underline"
      >
        Refund Policy
      </Link>
      .
    </p>
  );
}

export function LegalFooterLinks({ className }: { className?: string }) {
  return (
    <p className={cn("text-[12px] text-[#697386]", className)}>
      <Link href={LEGAL.terms} className="hover:text-[#0a2540] hover:underline">
        Terms
      </Link>
      {" · "}
      <Link
        href={LEGAL.privacy}
        className="hover:text-[#0a2540] hover:underline"
      >
        Privacy
      </Link>
      {" · "}
      <Link href={LEGAL.refund} className="hover:text-[#0a2540] hover:underline">
        Refunds
      </Link>
    </p>
  );
}
