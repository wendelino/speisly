import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Rendert eine React-Komponente erst bei Bedarf in einen eigenen Root am Ende
 * von <body>. So laden Seiten mit Filter/Kalender zunächst kein React; der
 * Chunk wird bei Hover/Touch/Fokus vorgeladen und beim Klick gerendert.
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
