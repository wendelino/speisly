/**
 * Migration 0006: Altdaten aus meal_update und error_log werden übernommen.
 * Legt eine eigene Wegwerf-Datenbank an (braucht CREATEDB, sonst übersprungen),
 * spielt die Migrationen bis 0005 ein, fügt Altdaten hinzu und prüft 0006.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS = join(import.meta.dir, "..", "drizzle");
const TEST_DB = `speisly_migration_${process.pid}`;

function withDatabase(url: string, database: string): string {
  const next = new URL(url);
  next.pathname = `/${database}`;
  return next.toString();
}

async function canCreateDatabase(adminClient: Client): Promise<boolean> {
  try {
    await adminClient.query(`create database "${TEST_DB}"`);
    return true;
  } catch {
    return false;
  }
}

async function applyMigration(target: Client, file: string) {
  const statements = readFileSync(join(MIGRATIONS, file), "utf8").split(
    "--> statement-breakpoint"
  );
  await target.query("begin");
  for (const statement of statements) {
    if (statement.trim()) {
      await target.query(statement);
    }
  }
  await target.query("commit");
}

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const before = files.filter((f) => f < "0006");
const migration = files.find((f) => f.startsWith("0006"));

let admin: Client | undefined;
let client: Client | undefined;
let ready = false;

beforeAll(async () => {
  if (!(DATABASE_URL && migration)) {
    return;
  }
  admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  ready = await canCreateDatabase(admin);
  if (!ready) {
    return;
  }
  client = new Client({
    connectionString: withDatabase(DATABASE_URL, TEST_DB),
  });
  await client.connect();
  for (const file of before) {
    await applyMigration(client, file);
  }
  await client.query(`
    insert into data_source (id, name, slug) values ('ds', 'Meine Mensa API', 'meine-mensa-api');
    insert into meal (id, src_id, data_source_slug, name, price_stud, price_work, price_guest)
      values ('m1', '1', 'meine-mensa-api', 'Testgericht', 350, 450, 600);
    insert into meal_update (id, meal_id, prev, new, key, created_at) values
      ('u1', 'm1', 'Alt', 'Neu', 'name', '2026-10-01T10:00:00Z'),
      ('u2', 'm1', '350 / 450 / 600', '380 / 480 / 630', 'price', '2026-10-02T10:00:00Z'),
      ('u3', 'm1', '', 'https://x/y.jpg', 'imgPath', '2026-10-03T10:00:00Z'),
      ('u4', 'm1', '2026-10-01', 'Entfernt', 'remove', '2026-10-04T10:00:00Z');
    insert into error_log (id, message, ctx, created_at) values
      ('e1', 'Price is 0', '{"n":1}', '2026-10-01T10:00:00Z'),
      ('e2', 'Price is 0', '{"n":2}', '2026-10-05T10:00:00Z'),
      ('e3', 'Kaputt', 'kein json', '2026-10-03T10:00:00Z');
    insert into feedback (id, message, created_at) values ('f1', 'Hallo Speisly', '2026-10-01 10:00:00');
  `);
  await applyMigration(client, migration);
});

afterAll(async () => {
  await client?.end();
  if (ready) {
    await admin?.query(`drop database if exists "${TEST_DB}"`);
  }
  await admin?.end();
});

describe.skipIf(!DATABASE_URL)("migration 0006", () => {
  test("meal_update becomes typed meal_change and serving_removal", async () => {
    if (!(ready && client)) {
      return;
    }
    const changes = await client.query(
      "select id, field, prev, next from meal_change order by id"
    );
    expect(changes.rows).toEqual([
      { id: "u1", field: "name", prev: "Alt", next: "Neu" },
      {
        id: "u2",
        field: "price",
        prev: { stud: 350, work: 450, guest: 600 },
        next: { stud: 380, work: 480, guest: 630 },
      },
      { id: "u3", field: "img_path", prev: "", next: "https://x/y.jpg" },
    ]);
    const removals = await client.query(
      "select id, meal_id, mensa_id, date::text as date from serving_removal"
    );
    expect(removals.rows).toEqual([
      { id: "u4", meal_id: "m1", mensa_id: null, date: "2026-10-01" },
    ]);
  });

  test("error_log is grouped by message", async () => {
    if (!(ready && client)) {
      return;
    }
    const errors = await client.query(
      "select source, message, count, first_seen_at, last_seen_at, last_ctx from error_log order by message"
    );
    expect(errors.rows).toEqual([
      {
        source: "legacy",
        message: "Kaputt",
        count: 1,
        first_seen_at: new Date("2026-10-03T10:00:00Z"),
        last_seen_at: new Date("2026-10-03T10:00:00Z"),
        last_ctx: "kein json",
      },
      {
        source: "legacy",
        message: "Price is 0",
        count: 2,
        first_seen_at: new Date("2026-10-01T10:00:00Z"),
        last_seen_at: new Date("2026-10-05T10:00:00Z"),
        last_ctx: { n: 2 },
      },
    ]);
  });

  test("feedback gets type and status", async () => {
    if (!(ready && client)) {
      return;
    }
    const rows = await client.query(
      "select type, status, created_at from feedback"
    );
    expect(rows.rows).toEqual([
      {
        type: "feedback",
        status: "open",
        created_at: new Date("2026-10-01T10:00:00Z"),
      },
    ]);
  });
});
