export async function readJson<T = unknown>(
  res: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const text = await res.text();

  if (!text) {
    return {
      ok: false,
      error: res.status === 401 ? "Unauthorized" : "Empty response from server",
      status: res.status,
    };
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    return {
      ok: false,
      error: "Invalid JSON response from server",
      status: res.status,
    };
  }

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    return { ok: false, error: message, status: res.status };
  }

  return { ok: true, data };
}
