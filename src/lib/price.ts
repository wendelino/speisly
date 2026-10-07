/** Cent-Betrag als deutscher Preis ohne Währung, z. B. 526 → "5,26" */
export function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
