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
