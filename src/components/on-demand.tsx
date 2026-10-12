import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Rendert eine React-Komponente in einen eigenen Root am Ende von <body>.
 * Filter/Kalender werden nach dem Seitenaufbau im Leerlauf geladen und
 * geschlossen vorgerendert (siehe `whenIdle`), damit der erste Klick sofort
 * öffnet; Hover/Touch/Fokus ziehen das vor, falls der Leerlauf noch aussteht.
 */
const roots = new Map<string, Root>();

export function mountOnce(key: string, render: () => ReactNode): void {
  if (roots.has(key)) {
    return;
  }
  const container = document.createElement("div");
  container.dataset.onDemand = key;
  document.body.append(container);
  const root = createRoot(container);
  root.render(render());
  roots.set(key, root);
}
