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
export const CURRENT_DATA_VERSION = 1;

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
