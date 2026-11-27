// @ts-check
/**
 * Erster Schritt von `bun run start` (vor der Migration): Fehlt eine
 * Pflichtangabe aus env-schema.mjs, endet der Start hier mit einer klaren
 * Liste statt mit einem Verbindungsfehler der Migration. server/index.mjs
 * prüft dasselbe noch einmal (für einen Start ohne dieses Script).
 */
import { envSchema } from "../env-schema.mjs";
import { exitOnInvalidEnv } from "./env.mjs";

exitOnInvalidEnv(envSchema, process.env);
