/**
 * Schema migration runner. Runs on `ready` for GMs only, is idempotent, preserves unknown fields,
 * and logs a single summary line.
 *
 * Data locations:
 *  - party profiles: world setting (array)
 *  - recipes: JournalEntry flags in the module folder
 *  - tag store: module data JournalEntry flag
 *  - table/result flags: RollTable and TableResult flags (migrated lazily on read; see table-flags.ts)
 */
import { FLAGS, MODULE_ID, SETTINGS } from "../constants.js";
import { SCHEMA_VERSIONS } from "../core/schemas.js";
import { getSetting, setSetting } from "./settings.js";

/** Bump when any persisted schema changes; add a step to MIGRATIONS below. */
export const CURRENT_DATA_VERSION = 2;

/** Module id used by the 0.1.0 pre-release; its document flags are copied forward once. */
export const LEGACY_MODULE_ID = "pf2e-encounter-builder";

export type MigrationStep = {
  version: number;
  description: string;
  run: () => Promise<{ changed: number }>;
};

/* -------------------------------------------- */
/*  Pure per-record migrations (unit-tested)    */
/* -------------------------------------------- */

/** Migrate a single party profile record to the current schema. Unknown fields are preserved. */
export function migratePartyProfileRecord(raw: Record<string, unknown>): {
  record: Record<string, unknown>;
  changed: boolean;
} {
  const record = { ...raw };
  let changed = false;
  if (record.schemaVersion === undefined) {
    // Pre-versioned prototype shape: { id, name, members: string[] } -> standalone profile.
    record.schemaVersion = 1;
    record.kind = record.kind ?? "standalone";
    if (Array.isArray(record.members) && record.members.every((m) => typeof m === "string")) {
      record.members = (record.members as string[]).map((uuid) => ({ uuid, active: true }));
    }
    record.referencePolicy = record.referencePolicy ?? null;
    record.manualReferenceLevel = record.manualReferenceLevel ?? null;
    record.selectedThreat = record.selectedThreat ?? "moderate";
    changed = true;
  }
  return { record, changed };
}

/** Migrate a single recipe record to the current schema. Unknown fields are preserved. */
export function migrateRecipeRecord(raw: Record<string, unknown>): {
  record: Record<string, unknown>;
  changed: boolean;
} {
  const record = { ...raw };
  let changed = false;
  if (record.schemaVersion === undefined) {
    record.schemaVersion = 1;
    record.notes = typeof record.notes === "string" ? record.notes : "";
    record.origin = record.origin ?? "manual";
    record.evaluation = record.evaluation ?? null;
    const now = Date.now();
    record.createdAt = typeof record.createdAt === "number" ? record.createdAt : now;
    record.updatedAt = typeof record.updatedAt === "number" ? record.updatedAt : now;
    if (Array.isArray(record.entries)) {
      record.entries = record.entries.map((e) => {
        const entry = { ...(e as Record<string, unknown>) };
        entry.locked = typeof entry.locked === "boolean" ? entry.locked : false;
        entry.level = typeof entry.level === "number" ? entry.level : 0;
        entry.name = typeof entry.name === "string" ? entry.name : "";
        return entry;
      });
    }
    changed = true;
  }
  return { record, changed };
}

/* -------------------------------------------- */
/*  Runner                                      */
/* -------------------------------------------- */

const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    description: "Stamp schemaVersion on party profiles and saved recipes",
    async run() {
      let changed = 0;
      const profiles = getSetting<unknown[]>(SETTINGS.partyProfiles) ?? [];
      const migratedProfiles = profiles.map((p) => {
        const result = migratePartyProfileRecord((p ?? {}) as Record<string, unknown>);
        if (result.changed) changed++;
        return result.record;
      });
      if (changed > 0) await setSetting(SETTINGS.partyProfiles, migratedProfiles);

      for (const journal of game.journal.contents) {
        const raw = journal.getFlag(MODULE_ID, FLAGS.recipe);
        if (!raw || typeof raw !== "object") continue;
        const result = migrateRecipeRecord(raw as Record<string, unknown>);
        if (result.changed) {
          await journal.setFlag(MODULE_ID, FLAGS.recipe, result.record);
          changed++;
        }
      }
      return { changed };
    },
  },
  {
    version: 2,
    description: "Copy document flags from the pf2e-encounter-builder namespace",
    async run() {
      let changed = 0;
      for (const journal of game.journal.contents) {
        const legacy = journal.flags?.[LEGACY_MODULE_ID] as Record<string, unknown> | undefined;
        if (!legacy || typeof legacy !== "object") continue;
        const current = (journal.flags?.[MODULE_ID] as Record<string, unknown> | undefined) ?? {};
        const update: Record<string, unknown> = {};
        for (const key of [FLAGS.dataJournal, FLAGS.tags, FLAGS.themes, FLAGS.recipe]) {
          if (legacy[key] !== undefined && current[key] === undefined)
            update[`flags.${MODULE_ID}.${key}`] = legacy[key];
        }
        if (Object.keys(update).length === 0) continue;
        await journal.update(update);
        changed++;
      }
      for (const table of game.tables.contents) {
        const legacy = table.flags?.[LEGACY_MODULE_ID] as Record<string, unknown> | undefined;
        if (legacy?.[FLAGS.table] === undefined || table.getFlag(MODULE_ID, FLAGS.table) !== undefined)
          continue;
        const results = table.results.contents
          .filter(
            (r) =>
              (r.flags?.[LEGACY_MODULE_ID] as Record<string, unknown> | undefined)?.[FLAGS.result] !==
              undefined,
          )
          .map((r) => ({
            _id: r.id,
            [`flags.${MODULE_ID}.${FLAGS.result}`]: (r.flags[LEGACY_MODULE_ID] as Record<string, unknown>)[
              FLAGS.result
            ],
          }));
        await table.update({ [`flags.${MODULE_ID}.${FLAGS.table}`]: legacy[FLAGS.table] });
        if (results.length) await table.updateEmbeddedDocuments("TableResult", results);
        changed++;
      }
      return { changed };
    },
  },
];

export async function runMigrations(): Promise<void> {
  if (!game.user.isGM) return;
  const stored = Number(getSetting<number>(SETTINGS.dataSchemaVersion) ?? 0);
  if (stored >= CURRENT_DATA_VERSION) return;

  let totalChanged = 0;
  const applied: number[] = [];
  for (const step of MIGRATIONS.filter((m) => m.version > stored).sort((a, b) => a.version - b.version)) {
    try {
      const { changed } = await step.run();
      totalChanged += changed;
      applied.push(step.version);
      await setSetting(SETTINGS.dataSchemaVersion, step.version);
    } catch (error) {
      console.error(`${MODULE_ID} | Migration ${step.version} failed (${step.description})`, error);
      ui.notifications.error(game.i18n.format(`${MODULE_ID}.migrations.failed`, { version: step.version }));
      return;
    }
  }
  console.info(
    `${MODULE_ID} | Migrations applied: ${applied.join(", ") || "none"}; records changed: ${totalChanged}; schema versions: ${JSON.stringify(SCHEMA_VERSIONS)}`,
  );
}
