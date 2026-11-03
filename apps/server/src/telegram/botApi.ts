/**
 * One Bot API call; resolves to the `result`, throws with Telegram's description on failure. `base` is
 * Telegram's address (a local stand-in in tests, TELEGRAM_API_BASE).
 */
type Fetch = typeof fetch;

export async function botApi<T = unknown>(token: string, method: string, params: Record<string, unknown>, fetchImpl: Fetch = fetch, base = 'https://api.telegram.org'): Promise<T> {
  const res = await fetchImpl(`${base}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!data?.ok) throw new Error(`${method}: ${data?.description ?? `HTTP ${res.status}`}`);
  return data.result as T;
}
