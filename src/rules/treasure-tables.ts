/*
 * Pathfinder Second Edition (Remaster) treasure rule constants.
 *
 * LICENSE: These values are game mechanics reproduced from *Pathfinder GM Core*
 * (© 2023 Paizo Inc.), Table 10-9 "Party Treasure by Level", used as Licensed Material under
 * the ORC License. See LICENSE-ORC.md at the repository root for the ORC Notice and attribution.
 * Everything else in this repository is MIT licensed; this file is kept separate so the licensing
 * boundary is explicit.
 *
 * Reference (human-readable, not fetched by the module):
 *   Treasure by level: https://2e.aonprd.com/Rules.aspx?ID=2683
 *
 * The table assumes a party of four characters over the course of one level. "Permanent" and
 * "consumable" list item slots as {level, count}: at party level 5 the party should find two 6th-level
 * and two 5th-level permanent items. "currency" is the party's spendable share and "perExtraPC" the
 * currency added for each PC beyond four (and removed for each below).
 */

export interface TreasureSlot {
  /** Item level of the items in this slot group. */
  level: number;
  count: number;
}

export interface TreasureRow {
  /** Total value of everything the party should find at this level, in gp. */
  total: number;
  permanent: TreasureSlot[];
  consumables: TreasureSlot[];
  /** Party currency in gp, for a party of four. */
  currency: number;
  /** Currency in gp added per additional PC beyond four. */
  perExtraPC: number;
}

/** GM Core Table 10-9, indexed by party level 1..20. */
export const TREASURE_BY_LEVEL: Readonly<Record<number, TreasureRow>> = {
  1: {
    total: 175,
    permanent: slots([2, 2], [1, 2]),
    consumables: slots([2, 2], [1, 3]),
    currency: 40,
    perExtraPC: 10,
  },
  2: {
    total: 300,
    permanent: slots([3, 2], [2, 2]),
    consumables: slots([3, 2], [2, 2], [1, 2]),
    currency: 70,
    perExtraPC: 18,
  },
  3: {
    total: 500,
    permanent: slots([4, 2], [3, 2]),
    consumables: slots([4, 2], [3, 2], [2, 2]),
    currency: 120,
    perExtraPC: 30,
  },
  4: {
    total: 850,
    permanent: slots([5, 2], [4, 2]),
    consumables: slots([5, 2], [4, 2], [3, 2]),
    currency: 200,
    perExtraPC: 50,
  },
  5: {
    total: 1350,
    permanent: slots([6, 2], [5, 2]),
    consumables: slots([6, 2], [5, 2], [4, 2]),
    currency: 320,
    perExtraPC: 80,
  },
  6: {
    total: 2000,
    permanent: slots([7, 2], [6, 2]),
    consumables: slots([7, 2], [6, 2], [5, 2]),
    currency: 500,
    perExtraPC: 125,
  },
  7: {
    total: 2900,
    permanent: slots([8, 2], [7, 2]),
    consumables: slots([8, 2], [7, 2], [6, 2]),
    currency: 720,
    perExtraPC: 180,
  },
  8: {
    total: 4000,
    permanent: slots([9, 2], [8, 2]),
    consumables: slots([9, 2], [8, 2], [7, 2]),
    currency: 1000,
    perExtraPC: 250,
  },
  9: {
    total: 5700,
    permanent: slots([10, 2], [9, 2]),
    consumables: slots([10, 2], [9, 2], [8, 2]),
    currency: 1400,
    perExtraPC: 350,
  },
  10: {
    total: 8000,
    permanent: slots([11, 2], [10, 2]),
    consumables: slots([11, 2], [10, 2], [9, 2]),
    currency: 2000,
    perExtraPC: 500,
  },
  11: {
    total: 11500,
    permanent: slots([12, 2], [11, 2]),
    consumables: slots([12, 2], [11, 2], [10, 2]),
    currency: 2800,
    perExtraPC: 700,
  },
  12: {
    total: 16500,
    permanent: slots([13, 2], [12, 2]),
    consumables: slots([13, 2], [12, 2], [11, 2]),
    currency: 4000,
    perExtraPC: 1000,
  },
  13: {
    total: 25000,
    permanent: slots([14, 2], [13, 2]),
    consumables: slots([14, 2], [13, 2], [12, 2]),
    currency: 6000,
    perExtraPC: 1500,
  },
  14: {
    total: 36500,
    permanent: slots([15, 2], [14, 2]),
    consumables: slots([15, 2], [14, 2], [13, 2]),
    currency: 9000,
    perExtraPC: 2250,
  },
  15: {
    total: 54500,
    permanent: slots([16, 2], [15, 2]),
    consumables: slots([16, 2], [15, 2], [14, 2]),
    currency: 13000,
    perExtraPC: 3250,
  },
  16: {
    total: 82500,
    permanent: slots([17, 2], [16, 2]),
    consumables: slots([17, 2], [16, 2], [15, 2]),
    currency: 20000,
    perExtraPC: 5000,
  },
  17: {
    total: 128000,
    permanent: slots([18, 2], [17, 2]),
    consumables: slots([18, 2], [17, 2], [16, 2]),
    currency: 30000,
    perExtraPC: 7500,
  },
  18: {
    total: 208000,
    permanent: slots([19, 2], [18, 2]),
    consumables: slots([19, 2], [18, 2], [17, 2]),
    currency: 48000,
    perExtraPC: 12000,
  },
  19: {
    total: 355000,
    permanent: slots([20, 2], [19, 2]),
    consumables: slots([20, 2], [19, 2], [18, 2]),
    currency: 80000,
    perExtraPC: 20000,
  },
  20: {
    total: 490000,
    permanent: slots([20, 4]),
    consumables: slots([20, 4], [19, 2]),
    currency: 140000,
    perExtraPC: 35000,
  },
};

/** Approximate XP a party earns over one level; used to turn an encounter's XP into a treasure share. */
export const XP_PER_LEVEL = 1000;

function slots(...pairs: [number, number][]): TreasureSlot[] {
  return pairs.map(([level, count]) => ({ level, count }));
}
