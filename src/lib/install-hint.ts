/**
 * Wann der „Als App installieren“-Hinweis (components/install) erscheint:
 * höchstens dreimal, nach dem Wegklicken frühestens 30 Tage später, nach der
 * Installation nie wieder. Gespeichert im localStorage (Datenschutz 3.1).
 */
export type InstallHintState = {
  shownCount: number;
  /** ISO-Zeitpunkt des letzten Wegklickens */
  dismissedAt: string | null;
  installed: boolean;
};

export const INSTALL_HINT_KEY = "speisly-install-hint";
const MAX_SHOWN = 3;
const PAUSE_MS = 30 * 86_400_000;

const EMPTY: InstallHintState = {
  shownCount: 0,
  dismissedAt: null,
  installed: false,
};

export function shouldShowInstallHint(
  state: InstallHintState,
  now: Date
): boolean {
  if (state.installed || state.shownCount >= MAX_SHOWN) {
    return false;
  }
  if (!state.dismissedAt) {
    return true;
  }
  const dismissed = Date.parse(state.dismissedAt);
  return Number.isNaN(dismissed) || now.getTime() - dismissed >= PAUSE_MS;
}

/** Gespeicherter Zustand; ohne (lesbaren) localStorage wie beim ersten Besuch */
export function readInstallHint(): InstallHintState {
  try {
    const data: Partial<InstallHintState> | null = JSON.parse(
      localStorage.getItem(INSTALL_HINT_KEY) ?? "null"
    );
    return {
      shownCount:
        typeof data?.shownCount === "number"
          ? data.shownCount
          : EMPTY.shownCount,
      dismissedAt:
        typeof data?.dismissedAt === "string" ? data.dismissedAt : null,
      installed: data?.installed === true,
    };
  } catch {
    return EMPTY;
  }
}

function update(patch: (state: InstallHintState) => Partial<InstallHintState>) {
  const state = readInstallHint();
  try {
    localStorage.setItem(
      INSTALL_HINT_KEY,
      JSON.stringify({ ...state, ...patch(state) })
    );
  } catch {
    // privater Modus o. ä.: Hinweis erscheint dann ggf. erneut
  }
}

export const markInstallHintShown = () =>
  update((state) => ({ shownCount: state.shownCount + 1 }));
export const markInstallHintDismissed = () =>
  update(() => ({ dismissedAt: new Date().toISOString() }));
export const markInstalled = () => update(() => ({ installed: true }));
