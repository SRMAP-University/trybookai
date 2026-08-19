import { countryName, flagEmoji } from "@/lib/country-display";
import { cn } from "@/lib/utils";

export function CountryFlag({
  code,
  className,
  showCode = true,
}: {
  code: string | null | undefined;
  className?: string;
  showCode?: boolean;
}) {
  const flag = flagEmoji(code);
  const name = countryName(code);

  if (!flag || !code) {
    return (
      <span
        className={cn("text-[12px] text-[#a3acb9]", className)}
        title="Country unknown"
      >
        —
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={name ?? code}
    >
      <span className="text-[16px] leading-none" aria-hidden>
        {flag}
      </span>
      {showCode ? (
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#697386]">
          {code}
        </span>
      ) : null}
      <span className="sr-only">{name ?? code}</span>
    </span>
  );
}
