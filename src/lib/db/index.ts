// Übergang: Der DB-Client lebt in src/server/db.ts. Dieser Re-Export hält nur
// die noch nicht portierten Module (src/actions/*) lauffähig und fällt mit
// ihnen weg.
// biome-ignore lint/performance/noBarrelFile: temporary shim, removed in phase 5
export { db } from "@/server/db";
