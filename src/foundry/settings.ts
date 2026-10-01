import { MODULE_ID, SETTINGS } from "../constants.js";

/** Register world settings. Called once from the `init` hook. */
export function registerSettings(): void {
  const register = (key: string, data: Record<string, unknown>) =>
    game.settings.register(MODULE_ID, key, data);

  // Hidden storage (small collections only; large data lives in documents).
  register(SETTINGS.partyProfiles, { scope: "world", config: false, type: Array, default: [] });
  register(SETTINGS.activeParty, { scope: "world", config: false, type: String, default: "" });
  register(SETTINGS.selectedPacks, { scope: "world", config: false, type: Array, default: [] });
  register(SETTINGS.dataSchemaVersion, { scope: "world", config: false, type: Number, default: 0 });

  // Visible configuration.
  register(SETTINGS.tableMaxDepth, {
    name: `${MODULE_ID}.settings.tableMaxDepth.name`,
    hint: `${MODULE_ID}.settings.tableMaxDepth.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 5,
    range: { min: 1, max: 10, step: 1 },
  });
  register(SETTINGS.tableMaxQuantityPerEntry, {
    name: `${MODULE_ID}.settings.tableMaxQuantityPerEntry.name`,
    hint: `${MODULE_ID}.settings.tableMaxQuantityPerEntry.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 20,
    range: { min: 1, max: 100, step: 1 },
  });
  register(SETTINGS.tableMaxTotalCreatures, {
    name: `${MODULE_ID}.settings.tableMaxTotalCreatures.name`,
    hint: `${MODULE_ID}.settings.tableMaxTotalCreatures.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 40,
    range: { min: 1, max: 200, step: 1 },
  });
  register(SETTINGS.numberDuplicateTokens, {
    name: `${MODULE_ID}.settings.numberDuplicateTokens.name`,
    hint: `${MODULE_ID}.settings.numberDuplicateTokens.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  register(SETTINGS.debugMode, {
    name: `${MODULE_ID}.settings.debugMode.name`,
    hint: `${MODULE_ID}.settings.debugMode.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
}

export function getSetting<T>(key: string): T {
  return game.settings.get(MODULE_ID, key) as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await game.settings.set(MODULE_ID, key, value);
}

/** Resolution limits for encounter tables, read from settings. */
export function tableLimits(): { maxDepth: number; maxQuantityPerEntry: number; maxTotalCreatures: number } {
  return {
    maxDepth: getSetting<number>(SETTINGS.tableMaxDepth),
    maxQuantityPerEntry: getSetting<number>(SETTINGS.tableMaxQuantityPerEntry),
    maxTotalCreatures: getSetting<number>(SETTINGS.tableMaxTotalCreatures),
  };
}
