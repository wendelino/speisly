// @ts-check
import { validateEnvVariable } from "astro/env/runtime";

/**
 * Prüft die Umgebung gegen das Schema aus env-schema.mjs mit denselben Regeln
 * wie `astro:env` (leer zählt als nicht gesetzt). Gibt je ungültiger
 * Variable eine Zeile zurück, nie ihren Wert (Secrets landen nicht im Log).
 *
 * @param {Record<string, object>} schema
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function invalidEnv(schema, env) {
  const errors = [];
  for (const [key, options] of Object.entries(schema)) {
    const raw = env[key];
    const result = validateEnvVariable(
      raw === "" ? undefined : raw,
      /** @type {any} */ (options)
    );
    if (!result.ok) {
      errors.push(
        raw === undefined || raw === ""
          ? `${key} fehlt`
          : `${key} ist ungültig (${result.errors.join(", ")})`
      );
    }
  }
  return errors;
}

/**
 * Beendet den Prozess mit Exit-Code 1, wenn die Umgebung nicht zum Schema
 * passt, und nennt alle betroffenen Variablen.
 *
 * @param {Record<string, object>} schema
 * @param {Record<string, string | undefined>} env
 */
export function exitOnInvalidEnv(schema, env) {
  const errors = invalidEnv(schema, env);
  if (errors.length > 0) {
    console.error(
      `[server] Umgebungsvariablen fehlen oder sind ungültig (siehe .env.example):\n${errors.map((e) => `  - ${e}`).join("\n")}`
    );
    process.exit(1);
  }
}
