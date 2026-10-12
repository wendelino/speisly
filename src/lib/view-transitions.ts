/**
 * Cross-Document View Transitions zwischen Gerichtskarte und Detailseite.
 * Namen werden nur für das jeweils angeklickte Gericht vergeben: Bei ~90
 * Karten mit festen Namen müsste der Browser bei jeder Navigation 90
 * Snapshots erstellen.
 *
 * Elemente tragen nur ihre Rolle (`data-vt="image"`, `title`, `price`,
 * `ingredients`; meal-card.astro, meal/[mealId].astro). Der Name
 * `meal-<rolle>-<mmid>` entsteht erst hier: auf der Liste innerhalb der Karte
 * mit dieser mmid, auf der Detailseite aus der mmid der URL. Das spart pro
 * Karte ~150 Byte gegenüber fertigen Namen im HTML.
 * Alle anderen Navigationen (z. B. Tag → Tag) laufen ohne Transition: Das
 * Überblenden der ganzen Seite ließ dort die Bilder kurz verschwinden.
 * Die Funktion läuft als Inline-Script im <head>, damit `pagereveal` vor dem
 * ersten Rendern registriert ist; sie muss daher in sich geschlossen sein
 * (wird per toString eingebettet).
 */
export function viewTransitionBoot() {
  const isMealPage = (url: string | undefined) =>
    Boolean(url && new URL(url).pathname.startsWith("/meal/"));
  const mmidOf = (url: string) => new URL(url).searchParams.get("mmid");

  const nameWithin = (root: ParentNode | null, mmid: string | null) => {
    // biome-ignore lint/performance/useTopLevelRegex: Funktion muss in sich geschlossen sein (toString)
    if (!(root && mmid && /^[\w-]+$/.test(mmid))) {
      return;
    }
    for (const el of root.querySelectorAll<HTMLElement>("[data-vt]")) {
      el.style.viewTransitionName = `meal-${el.dataset.vt}-${mmid}`;
    }
  };
  // Detailseite: alle Rollen der Seite; Liste: nur die angeklickte Karte
  const nameDetail = () => nameWithin(document, mmidOf(location.href));
  const nameCard = (mmid: string | null) =>
    nameWithin(
      mmid
        ? document.querySelector(`a[data-meal][href$="?mmid=${mmid}"]`)
        : null,
      mmid
    );

  type NavEvent = Event & {
    viewTransition?: { skipTransition: () => void } | null;
    activation?: { entry?: { url?: string } } | null;
  };

  // `other`: die Seite auf der anderen Seite der Navigation
  const prepare = (event: Event, other: string | undefined) => {
    const transition = (event as NavEvent).viewTransition;
    if (!(transition && other)) {
      return;
    }
    if (isMealPage(location.href)) {
      nameDetail();
    } else if (isMealPage(other)) {
      nameCard(mmidOf(other));
    } else {
      transition.skipTransition();
    }
  };

  // Seite wird verlassen
  window.addEventListener("pageswap", (event) =>
    prepare(event, (event as NavEvent).activation?.entry?.url)
  );
  // neue Seite erscheint
  window.addEventListener("pagereveal", (event) =>
    prepare(
      event,
      (
        window as Window & {
          navigation?: { activation?: { from?: { url?: string } } | null };
        }
      ).navigation?.activation?.from?.url
    )
  );
}
