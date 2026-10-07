/**
 * Cross-Document View Transitions zwischen Gerichtskarte und Detailseite
 * (vorher React <ViewTransition> in Next). Namen werden nur für das jeweils
 * angeklickte Gericht vergeben: Bei ~90 Karten mit festen Namen müsste der
 * Browser bei jeder Navigation 90 Snapshots erstellen.
 *
 * Elemente tragen nur ihre Rolle (`data-vt="image"`, `title`, `price`,
 * `ingredients`; meal-card.astro, meal/[mealId].astro). Der Name
 * `meal-<rolle>-<mmid>` entsteht erst hier: auf der Liste innerhalb der Karte
 * mit dieser mmid, auf der Detailseite aus der mmid der URL. Das spart pro
 * Karte ~150 Byte gegenüber fertigen Namen im HTML.
 * Kommt man per Transition von der Liste auf die Detailseite, zeigt das Bild
 * dort zuerst die URL des Kartenbilds (`data-meal-small`, meal-image.astro),
 * also einen Cache-Treffer, und tauscht auf das große, sobald es dekodiert
 * ist. So steht nach dem Morph sofort ein Bild da.
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

  // Detailseite: erst das Kartenbild (Cache), dann das große
  const showSmallFirst = () => {
    const img = document.querySelector<HTMLImageElement>(
      "img[data-meal-small]"
    );
    const source = img?.parentElement?.querySelector("source");
    const small = img?.dataset.mealSmall;
    if (!(img && source && small) || img.complete) {
      return;
    }
    const large = source.srcset;
    // zuerst anfordern, damit die laufende Anfrage weiterverwendet wird
    const hi = new Image();
    hi.src = large;
    if (hi.complete) {
      return;
    }
    // ohne Einblenden: Das Bild soll beim Ende der Transition voll da sein
    img.style.transition = "none";
    source.srcset = small;
    const restore = () => {
      // bis das neue Bild verfügbar ist, zeigt der Browser weiter das kleine
      source.srcset = large;
    };
    hi.decode().then(restore, restore);
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
      nameDetail();
    } else if (isMealPage(to)) {
      nameCard(mmidOf(to));
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
      nameDetail();
      if (!isMealPage(from)) {
        showSmallFirst();
      }
    } else if (isMealPage(from)) {
      nameCard(mmidOf(from));
    }
  });
}
