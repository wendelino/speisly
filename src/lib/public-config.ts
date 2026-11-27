/**
 * Öffentliche Einstellungen, die der Browser braucht. Sie stehen nicht im
 * Bundle (das ist für alle Umgebungen dasselbe), sondern kommen zur Laufzeit
 * als `<meta>` aus dem HTML (components/layout/public-config.astro).
 */
export const VAPID_META = "speisly:vapid-public-key";

/** VAPID-Schlüssel für Web-Push; `undefined` = Push nicht eingerichtet */
export function vapidPublicKey(): string | undefined {
  return (
    document.querySelector<HTMLMetaElement>(`meta[name="${VAPID_META}"]`)
      ?.content || undefined
  );
}
