/**
 * Cross-Document View Transitions zwischen Gerichtskarte und Detailseite
 * (vorher React <ViewTransition> in Next). Namen werden nur für das jeweils
 * angeklickte Gericht vergeben: Bei ~90 Karten mit festen Namen müsste der
 * Browser bei jeder Navigation 90 Snapshots erstellen.
 *
 * Elemente tragen `data-vt="meal-image-<mmid>"` usw. (meal-card.astro,
 * meal/[mealId].astro). Die Funktion läuft als Inline-Script im <head>, damit
 * `pagereveal` vor dem ersten Rendern registriert ist; sie muss daher in sich
 * geschlossen sein (wird per toString eingebettet).
 */
export function viewTransitionBoot() {
  const isMealPage = (url: string | undefined) =>
    Boolean(url && new URL(url).pathname.startsWith("/meal/"));
  const mmidOf = (url: string) => new URL(url).searchParams.get("mmid");

  const nameAll = (selector: string) => {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      el.style.viewTransitionName = el.dataset.vt ?? "";
    }
  };
  const nameServing = (mmid: string | null) => {
    // biome-ignore lint/performance/useTopLevelRegex: Funktion muss in sich geschlossen sein (toString)
    if (mmid && /^[\w-]+$/.test(mmid)) {
      nameAll(`[data-vt$="-${mmid}"]`);
    }
  };

  type NavEvent = Event & {
    viewTransition?: unknown;
    activation?: { entry?: { url?: string } };
  };

  // Seite wird verlassen
  window.addEventListener("pageswap", (event) => {
    const e = event as NavEvent;
    const to = e.activation?.entry?.url;
    if (!(e.viewTransition && to)) {
      return;
    }
    if (isMealPage(location.href)) {
      nameAll("[data-vt]");
    } else if (isMealPage(to)) {
      nameServing(mmidOf(to));
    }
  });

  // neue Seite erscheint
  window.addEventListener("pagereveal", (event) => {
    const e = event as NavEvent;
    const from = (
      window as Window & {
        navigation?: { activation?: { from?: { url?: string } } };
      }
    ).navigation?.activation?.from?.url;
    if (!(e.viewTransition && from)) {
      return;
    }
    if (isMealPage(location.href)) {
      nameAll("[data-vt]");
    } else if (isMealPage(from)) {
      nameServing(mmidOf(from));
    }
  });
}
