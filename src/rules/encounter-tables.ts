/*
 * Pathfinder Second Edition (Remaster) encounter-building rule constants.
 *
 * LICENSE: These values are game mechanics reproduced from *Pathfinder GM Core*
 * (© 2023 Paizo Inc.), used as Licensed Material under the ORC License.
 * See LICENSE-ORC.md at the repository root for the ORC Notice and attribution.
 * Everything else in this repository is MIT licensed; this file is kept separate
 * so the licensing boundary is explicit.
 *
 * Reference (human-readable, not fetched by the module):
 *   Encounter budget:  https://2e.aonprd.com/Rules.aspx?ID=2717
 *   Party size:        https://2e.aonprd.com/Rules.aspx?ID=2719
 *
 * The same constants appear in the PF2e system's `calculateXP` helper
 * (src/scripts/macros/xp/index.ts, `xpCreatureDifferences`), which was used as a
 * second check during implementation. See docs/VERIFICATION.md.
 */

export const THREAT_LEVELS = ["trivial", "low", "moderate", "severe", "extreme"] as const;
export type ThreatLevel = (typeof THREAT_LEVELS)[number];

/** XP budget for a party of four characters, and the per-character adjustment. */
export const THREAT_BUDGETS: Readonly<Record<ThreatLevel, { base: number; perCharacter: number }>> = {
  trivial: { base: 40, perCharacter: 10 },
  low: { base: 60, perCharacter: 20 },
  moderate: { base: 80, perCharacter: 20 },
  severe: { base: 120, perCharacter: 30 },
  extreme: { base: 160, perCharacter: 40 },
};

/** The party size the base budgets are written for. */
export const BASE_PARTY_SIZE = 4;

/** XP contribution of a creature by its level relative to the party's reference level. */
export const CREATURE_XP_BY_RELATIVE_LEVEL: ReadonlyMap<number, number> = new Map([
  [-4, 10],
  [-3, 15],
  [-2, 20],
  [-1, 30],
  [0, 40],
  [1, 60],
  [2, 80],
  [3, 120],
  [4, 160],
]);

export const MIN_RELATIVE_LEVEL = -4;
export const MAX_RELATIVE_LEVEL = 4;

/** Character levels in PF2e run 1–20; creature levels run -1 and up. */
export const MIN_CHARACTER_LEVEL = 1;
export const MAX_CHARACTER_LEVEL = 20;
