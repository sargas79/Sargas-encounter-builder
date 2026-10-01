/** Module identifier. Also the namespace for flags, settings, hooks and CSS classes. */
export const MODULE_ID = "pf2e-encounter-builder" as const;

/** Flag keys used under `flags[MODULE_ID]`. */
export const FLAGS = {
  /** Saved encounter recipe stored on a JournalEntry. */
  recipe: "recipe",
  /** Table-level encounter metadata on a RollTable. */
  table: "table",
  /** Row-level encounter metadata on a TableResult. */
  result: "result",
  /** Custom creature tag map on the module data JournalEntry. */
  tags: "tags",
  /** Marker that a JournalEntry is the module data journal. */
  dataJournal: "dataJournal",
  /** Provenance marker on imported world Actors. */
  importedFrom: "importedFrom",
  /** Marker on tokens created by a deployment operation. */
  deployment: "deployment",
} as const;

/** World setting keys. */
export const SETTINGS = {
  partyProfiles: "partyProfiles",
  activeParty: "activeParty",
  selectedPacks: "selectedPacks",
  tableMaxDepth: "tableMaxDepth",
  tableMaxQuantityPerEntry: "tableMaxQuantityPerEntry",
  tableMaxTotalCreatures: "tableMaxTotalCreatures",
  numberDuplicateTokens: "numberDuplicateTokens",
  debugMode: "debugMode",
  dataSchemaVersion: "dataSchemaVersion",
} as const;

/** Names of module-owned documents. */
export const DOCUMENT_NAMES = {
  dataJournal: "Encounter Builder Data",
  recipeFolder: "Encounter Builder: Saved Encounters",
} as const;

/** Hooks emitted by the module (all prefixed with the module id). */
export const HOOKS = {
  evaluationChanged: `${MODULE_ID}.evaluationChanged`,
  deploymentComplete: `${MODULE_ID}.deploymentComplete`,
} as const;
