/**
 * Fresh builds (v0.3). A browser tab or a Telegram webview left open keeps running the code it was
 * opened with — Safari brings a page back from memory without asking the server — so a player can go on
 * seeing an old version for days after a release. When the game comes back to the foreground (and every
 * quarter of an hour) it asks for its page again, never from a cache, and compares the bundle the page
 * names with its own. On a difference it reloads — only in the main menu with nothing open, never in a
 * match or a lobby; otherwise on the next return to the menu. A page that has already reloaded for a
 * build doesn't do it again (no loops if a cache somewhere keeps serving the old bundle).
 */
const BUNDLE = /assets\/app-[A-Za-z0-9_-]+\.js/;
const DONE_KEY = 'blatkom89.reloadedFor';

/** The bundle this page runs (`assets/app-<hash>.js`), or null where there is none to compare (demo file). */
export function ownBundle(doc: Document = document): string | null {
  for (const s of Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type=module][src]'))) {
    const m = BUNDLE.exec(s.getAttribute('src') ?? '');
    if (m) return m[0];
  }
  return null;
}

/** The bundle a freshly fetched page names. */
export function pageBundle(html: string): string | null {
  return BUNDLE.exec(html)?.[0] ?? null;
}

export interface UpdateWatch {
  /** Call on returning to the main menu: reloads now if a newer build was found earlier. */
  atMenu(): void;
  /** Asks the server now (tests and the menu use it); resolves to whether a newer build exists. */
  check(): Promise<boolean>;
}

export function watchForUpdates(o: {
  /** Whether reloading now loses nothing: the main menu, nothing open on top. */
  canReload: () => boolean;
  /** Shown for a moment before the reload. */
  notify?: () => void;
  fetchPage?: () => Promise<string>;
  reload?: () => void;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  everyMs?: number;
  /** The running bundle (tests); read from the page otherwise. */
  own?: string | null;
}): UpdateWatch | null {
  const browser = typeof document !== 'undefined';
  const own = o.own !== undefined ? o.own : browser ? ownBundle() : null;
  if (!own) return null;
  const store = o.storage === undefined ? safeSession() : o.storage;
  const fetchPage =
    o.fetchPage ??
    (async () => {
      const url = new URL('./', location.href);
      url.searchParams.set('_v', String(Date.now()));
      const r = await fetch(url.toString(), { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    });
  const reload = o.reload ?? (() => location.reload());
  let pending: string | null = null;
  let checking: Promise<boolean> | null = null;
  let lastCheck = 0;

  const reloadNow = () => {
    if (!pending) return;
    try {
      store?.setItem(DONE_KEY, pending);
    } catch {
      /* private mode: at worst one more reload */
    }
    o.notify?.();
    const go = () => reload();
    if (o.notify) setTimeout(go, 700);
    else go();
  };
  const tryReload = () => {
    if (pending && o.canReload()) reloadNow();
  };
  const check = (): Promise<boolean> => {
    if (checking) return checking;
    lastCheck = Date.now();
    checking = fetchPage()
      .then((html) => {
        const fresh = pageBundle(html);
        let done: string | null = null;
        try {
          done = store?.getItem(DONE_KEY) ?? null;
        } catch {
          done = null;
        }
        if (fresh && fresh !== own && fresh !== done) {
          pending = fresh;
          tryReload();
          return true;
        }
        return false;
      })
      .catch(() => false)
      .finally(() => (checking = null));
    return checking;
  };
  const soon = () => {
    // a phone waking up fires several events at once: one question is enough
    if (Date.now() - lastCheck > 30_000) void check();
  };
  if (browser) {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon());
    window.addEventListener('pageshow', (e) => (e as PageTransitionEvent).persisted && soon());
    window.addEventListener('focus', soon);
    setInterval(() => document.visibilityState === 'visible' && soon(), o.everyMs ?? 15 * 60_000);
  }
  return {
    atMenu() {
      if (pending) tryReload();
      else soon();
    },
    check,
  };
}

function safeSession(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
