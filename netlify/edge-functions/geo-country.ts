/**
 * Copy Netlify edge geo onto a request header so Node/Next APIs can store it.
 */
export default async (
  request: Request,
  context: {
    geo?: { country?: { code?: string } };
    next: (input?: Request) => unknown;
  }
) => {
  const code = context.geo?.country?.code;
  if (!code) return;

  const headers = new Headers(request.headers);
  if (headers.get("x-bookai-country")) return;

  headers.set("x-bookai-country", code.toUpperCase());
  return context.next(new Request(request, { headers }));
};

export const config = {
  path: "/*",
};
