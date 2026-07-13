/** Strip accidental whitespace / literal `\r\n` from Vercel env values. */
export function cleanEnv(value?: string | null): string {
  if (!value) return "";
  return value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/[\r\n]+/g, "")
    .trim();
}

export function cleanEnvUrl(value?: string | null): string | null {
  const cleaned = cleanEnv(value).replace(/\/$/, "");
  return cleaned || null;
}
