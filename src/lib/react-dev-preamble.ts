/**
 * Lädt ein React-Modul (z. B. einen *.mount.tsx-Dialog) nach – im Dev-Server
 * vorher die Fast-Refresh-Preamble von @vitejs/plugin-react.
 *
 * Hintergrund: Astro lädt die Preamble (`astro:scripts/before-hydration.js`,
 * injiziert von @astrojs/react) nur über <astro-island>, also nur auf Seiten
 * mit `client:*`-Direktiven. Wir mounten React selbst (components/on-demand.tsx),
 * deshalb würde `astro dev` sonst beim ersten React-Modul mit
 * „@vitejs/plugin-react can't detect preamble“ abbrechen. Im Build ist Fast
 * Refresh aus und die Preamble leer, deshalb nur im Dev.
 */
export function loadReactModule<T>(load: () => Promise<T>): Promise<T> {
  if (!import.meta.env.DEV) {
    return load();
  }
  return import(/* @vite-ignore */ "astro:scripts/before-hydration.js").then(
    load
  );
}
