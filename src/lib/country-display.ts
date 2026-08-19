const ISO_COUNTRY = /^[A-Z]{2}$/;

export function normalizeCountryCode(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (!ISO_COUNTRY.test(code)) return null;
  if (code === "XX" || code === "T1" || code === "A1" || code === "A2") {
    return null;
  }
  return code;
}

export function flagEmoji(countryCode: string | null | undefined): string | null {
  const code = normalizeCountryCode(countryCode ?? undefined);
  if (!code) return null;
  const chars = [...code].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...chars);
}

export function countryName(countryCode: string | null | undefined): string | null {
  const code = normalizeCountryCode(countryCode ?? undefined);
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
