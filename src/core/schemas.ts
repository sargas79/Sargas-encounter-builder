/**
 * Versioned data schemas for everything the module persists, plus boundary validators.
 *
 * Bump a schema version whenever a persisted shape changes, and add a migration in
 * ../foundry/migrations.ts. Validators are deliberately tolerant of unknown extra fields
 * (they are preserved on write) and strict about the fields the module reads.
 */
import type { ThreatLevel } from "../rules/encounter-tables.js";
import type { ReferenceLevelPolicy } from "./budget.js";

export const SCHEMA_VERSIONS = {
  partyProfile: 1,
  recipe: 1,
  tableFlags: 1,
  resultFlags: 1,
  tagStore: 1,
} as const;

/* -------------------------------------------- */
/*  Party profiles (world setting)              */
/* -------------------------------------------- */

export interface PartyMemberOverride {
  uuid: string;
  /** false = present in roster but not participating */
  active: boolean;
  /** GM override: count an NPC ally as a party member */
  countsAsMember?: boolean;
}

export interface PartyProfileV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  /** Linked profiles read members from a PF2e Party actor; standalone profiles list actors directly. */
  kind: "linked" | "standalone";
  /** UUID of the PF2e Party actor when kind === "linked". */
  partyActorUuid?: string;
  /** Standalone: full member list. Linked: overrides for members of the Party actor. */
  members: PartyMemberOverride[];
  referencePolicy: ReferenceLevelPolicy | null;
  manualReferenceLevel: number | null;
  selectedThreat: ThreatLevel;
}

export type PartyProfile = PartyProfileV1;

/* -------------------------------------------- */
/*  Saved encounter recipes (JournalEntry flag) */
/* -------------------------------------------- */

export interface RecipeEntry {
  uuid: string;
  /** Name at save time, for display when the source is missing. */
  name: string;
  /** Level at save time, for display when the source is missing. */
  level: number;
  quantity: number;
  locked: boolean;
}

export interface EvaluationSnapshot {
  timestamp: number;
  partyProfileId: string | null;
  partyName: string;
  memberLevels: { uuid: string; name: string; level: number }[];
  partySize: number;
  referenceLevel: number;
  referencePolicy: ReferenceLevelPolicy | null;
  selectedThreat: ThreatLevel | null;
  target: number | null;
  supportedXP: number;
  complete: boolean;
  inferredLabel: string;
  difference: number | null;
}

export interface RecipeV1 {
  schemaVersion: 1;
  name: string;
  notes: string;
  entries: RecipeEntry[];
  /** How this encounter was produced. */
  origin: "manual" | "generated" | "table" | "variant";
  generation?: {
    seed: string | null;
    inputs: Record<string, unknown>;
  };
  policy?: "classic" | "partyScaled";
  /** Table resolution trace, when origin is "table" or "variant". */
  trace?: unknown;
  /** Original outcome for a balanced variant, with the diff that produced the saved entries. */
  variantOf?: {
    original: RecipeEntry[];
    diff: VariantDiffEntry[];
  };
  evaluation: EvaluationSnapshot | null;
  createdAt: number;
  updatedAt: number;
}

export interface VariantDiffEntry {
  uuid: string;
  name: string;
  change: "added" | "removed" | "quantityChanged";
  from: number;
  to: number;
}

export type Recipe = RecipeV1;

/* -------------------------------------------- */
/*  Encounter table flags                       */
/* -------------------------------------------- */

export type TableMode = "range" | "weight";

export interface TableFlagsV1 {
  schemaVersion: 1;
  /** Whether ranges are authored explicitly or derived from weights. */
  mode: TableMode;
  /** Optional encounter check, e.g. "1d6" with trigger values [1]. */
  encounterCheck: { formula: string; occursOn: number[] } | null;
  tags: { region: string[]; terrain: string[]; season: string[]; timeOfDay: string[] };
  notes: string;
}

export type ResultKind = "creatures" | "table" | "narrative" | "none" | "template";
export type NarrativeKind = "tracks" | "travelers" | "discovery" | "weather" | "other";

export interface CreatureGroupEntry {
  uuid: string;
  /** Fixed count or a pure dice formula (see dice-grammar.ts). */
  quantity: string;
}

export interface GenerationTemplate {
  /** Explicit candidate UUIDs, and/or filters applied to the selected packs. */
  candidates: string[];
  traits: string[];
  levelMin: number | null;
  levelMax: number | null;
  composition: CompositionPreference;
  threat: ThreatLevel | null;
}

export type CompositionPreference = "unrestricted" | "solo" | "pair" | "group" | "bossWithSupport";

export interface ResultFlagsV1 {
  schemaVersion: 1;
  kind: ResultKind;
  creatures: CreatureGroupEntry[];
  tableUuid: string | null;
  narrativeKind: NarrativeKind | null;
  template: GenerationTemplate | null;
  notes: string;
  journalUuid: string | null;
}

export type TableFlags = TableFlagsV1;
export type ResultFlags = ResultFlagsV1;

/* -------------------------------------------- */
/*  Custom tags (module data JournalEntry flag) */
/* -------------------------------------------- */

export interface TagStoreV1 {
  schemaVersion: 1;
  /** Source UUID -> tags such as "family:goblinoid" or "environment:forest". */
  tags: Record<string, string[]>;
}

export type TagStore = TagStoreV1;

/* -------------------------------------------- */
/*  Validators                                  */
/* -------------------------------------------- */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

const THREATS: readonly string[] = ["trivial", "low", "moderate", "severe", "extreme"];
const POLICIES: readonly string[] = ["uniform", "averageFloor", "highest", "lowest", "manual"];
const RESULT_KINDS: readonly string[] = ["creatures", "table", "narrative", "none", "template"];
const COMPOSITIONS: readonly string[] = ["unrestricted", "solo", "pair", "group", "bossWithSupport"];

export function validatePartyProfile(raw: unknown): ValidationResult<PartyProfile> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["not an object"] };
  if (raw.schemaVersion !== 1) errors.push(`unsupported schemaVersion ${String(raw.schemaVersion)}`);
  if (!isString(raw.id) || !raw.id) errors.push("id missing");
  if (!isString(raw.name)) errors.push("name missing");
  if (raw.kind !== "linked" && raw.kind !== "standalone") errors.push("kind invalid");
  if (raw.kind === "linked" && !isString(raw.partyActorUuid))
    errors.push("partyActorUuid missing for linked profile");
  if (!Array.isArray(raw.members)) errors.push("members not an array");
  else {
    raw.members.forEach((m, i) => {
      if (!isObject(m) || !isString(m.uuid) || !isBool(m.active)) errors.push(`members[${i}] invalid`);
    });
  }
  if (raw.referencePolicy !== null && !POLICIES.includes(raw.referencePolicy as string))
    errors.push("referencePolicy invalid");
  if (raw.manualReferenceLevel !== null && !isInt(raw.manualReferenceLevel))
    errors.push("manualReferenceLevel invalid");
  if (!THREATS.includes(raw.selectedThreat as string)) errors.push("selectedThreat invalid");
  return errors.length ? { ok: false, errors } : { ok: true, value: raw as unknown as PartyProfile };
}

export function validateRecipe(raw: unknown): ValidationResult<Recipe> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["not an object"] };
  if (raw.schemaVersion !== 1) errors.push(`unsupported schemaVersion ${String(raw.schemaVersion)}`);
  if (!isString(raw.name)) errors.push("name missing");
  if (!isString(raw.notes)) errors.push("notes missing");
  if (!Array.isArray(raw.entries)) errors.push("entries not an array");
  else {
    raw.entries.forEach((e, i) => {
      if (
        !isObject(e) ||
        !isString(e.uuid) ||
        !isInt(e.quantity) ||
        e.quantity < 0 ||
        !isBool(e.locked) ||
        !isInt(e.level)
      ) {
        errors.push(`entries[${i}] invalid`);
      }
    });
  }
  if (!["manual", "generated", "table", "variant"].includes(raw.origin as string))
    errors.push("origin invalid");
  if (raw.evaluation !== null && !isObject(raw.evaluation)) errors.push("evaluation invalid");
  if (!isInt(raw.createdAt) || !isInt(raw.updatedAt)) errors.push("timestamps invalid");
  return errors.length ? { ok: false, errors } : { ok: true, value: raw as unknown as Recipe };
}

export function validateTableFlags(raw: unknown): ValidationResult<TableFlags> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["not an object"] };
  if (raw.schemaVersion !== 1) errors.push(`unsupported schemaVersion ${String(raw.schemaVersion)}`);
  if (raw.mode !== "range" && raw.mode !== "weight") errors.push("mode invalid");
  if (raw.encounterCheck !== null) {
    if (
      !isObject(raw.encounterCheck) ||
      !isString(raw.encounterCheck.formula) ||
      !Array.isArray(raw.encounterCheck.occursOn)
    ) {
      errors.push("encounterCheck invalid");
    }
  }
  if (!isObject(raw.tags)) errors.push("tags missing");
  if (!isString(raw.notes)) errors.push("notes missing");
  return errors.length ? { ok: false, errors } : { ok: true, value: raw as unknown as TableFlags };
}

export function validateResultFlags(raw: unknown): ValidationResult<ResultFlags> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["not an object"] };
  if (raw.schemaVersion !== 1) errors.push(`unsupported schemaVersion ${String(raw.schemaVersion)}`);
  if (!RESULT_KINDS.includes(raw.kind as string)) errors.push("kind invalid");
  if (!Array.isArray(raw.creatures)) errors.push("creatures not an array");
  else {
    raw.creatures.forEach((c, i) => {
      if (!isObject(c) || !isString(c.uuid) || !isString(c.quantity)) errors.push(`creatures[${i}] invalid`);
    });
  }
  if (raw.tableUuid !== null && !isString(raw.tableUuid)) errors.push("tableUuid invalid");
  if (raw.template !== null) {
    if (
      !isObject(raw.template) ||
      !Array.isArray(raw.template.candidates) ||
      !COMPOSITIONS.includes(raw.template.composition as string)
    ) {
      errors.push("template invalid");
    }
  }
  if (!isString(raw.notes)) errors.push("notes missing");
  return errors.length ? { ok: false, errors } : { ok: true, value: raw as unknown as ResultFlags };
}

export function validateTagStore(raw: unknown): ValidationResult<TagStore> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["not an object"] };
  if (raw.schemaVersion !== 1) errors.push(`unsupported schemaVersion ${String(raw.schemaVersion)}`);
  if (!isObject(raw.tags)) errors.push("tags missing");
  else {
    for (const [uuid, tags] of Object.entries(raw.tags)) {
      if (!Array.isArray(tags) || !tags.every(isString)) errors.push(`tags[${uuid}] invalid`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: raw as unknown as TagStore };
}

/* -------------------------------------------- */
/*  Factories                                   */
/* -------------------------------------------- */

export function emptyTableFlags(): TableFlags {
  return {
    schemaVersion: 1,
    mode: "range",
    encounterCheck: null,
    tags: { region: [], terrain: [], season: [], timeOfDay: [] },
    notes: "",
  };
}

export function emptyResultFlags(kind: ResultKind = "narrative"): ResultFlags {
  return {
    schemaVersion: 1,
    kind,
    creatures: [],
    tableUuid: null,
    narrativeKind: kind === "narrative" ? "other" : null,
    template: null,
    notes: "",
    journalUuid: null,
  };
}

export function emptyTagStore(): TagStore {
  return { schemaVersion: 1, tags: {} };
}
