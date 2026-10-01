# Verification record

This file records what was verified against real sources during implementation, what could not be
verified in the build environment, and the exact steps to verify the remainder in a running Foundry world.

**Environment facts:** the build environment has no Foundry VTT installation and no browser access to
foundryvtt.com, paizo.com, or Archives of Nethys (those hosts were blocked by the egress proxy). Public
source files of the PF2e system were readable from `raw.githubusercontent.com`. All "verified" items below
were verified by reading source code and type definitions, not by executing code in Foundry.

## 1. Target versions

| Item                  | Evidence                                                                                                     | Decision                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| PF2e `release` branch | `static/system.json`: version **6.12.4**, compatibility `{minimum: 12.328, verified: 12.331, maximum: 12}`   | Foundry 12 line                                        |
| PF2e `v13-dev` branch | `static/system.json`: version **7.9.1**, compatibility `{minimum: 13.348, verified: 13.351, maximum: 13}`    | Foundry 13 line, the newest the system supports        |
| PF2e v14 branch       | No branch named `v14`, `v14-dev`, `v14-prototype`, `main`, `next`, or `release-v14` exists on the repository | **No PF2e release declares Foundry v14 compatibility** |
| Foundry v14           | foundryvtt.com unreachable from the build environment; could not confirm a stable v14 release                | Not confirmed                                          |

**Decision:** target **Foundry VTT 13** with **PF2e 7.x**. `module.json` declares `compatibility.minimum: "13"`,
`compatibility.maximum: "13"`, and leaves `verified` unset because the module has not been run. Foundry v14
is treated as provisional: when a PF2e release declares v14 support, re-verify §3 and §4 below (the
TableResult schema and ApplicationV2 APIs are the most likely to change) before raising `maximum`.

## 2. PF2e data paths (verified by source reading, PF2e `v13-dev` @ 7.9.1)

| Purpose                    | Path / API                                                                                                                                                                      | Source                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Actor level                | `actor.level` getter                                                                                                                                                            | `src/module/actor/base.ts` line ~208                                                                                                                   |
| Actor type check           | `actor.isOfType("character" \| "npc" \| "party" \| "familiar" \| "hazard")` and `actor.type`                                                                                    | `src/module/actor/base.ts`                                                                                                                             |
| NPC level in index         | `system.details.level.value`                                                                                                                                                    | `src/module/actor/npc/data.ts`; also the index field used by the system's own bestiary browser (`src/module/apps/compendium-browser/tabs/bestiary.ts`) |
| NPC traits / rarity / size | `system.traits.value`, `system.traits.rarity`, `system.traits.size.value`                                                                                                       | bestiary browser tab                                                                                                                                   |
| NPC publication            | `system.details.publication.title`                                                                                                                                              | bestiary browser tab                                                                                                                                   |
| Party actor type           | `type: "party"`                                                                                                                                                                 | `src/module/actor/party/document.ts`                                                                                                                   |
| Party members (source)     | `system.details.members: {uuid}[]`                                                                                                                                              | `src/module/actor/party/data.ts`                                                                                                                       |
| Party members (resolved)   | `party.members: CreaturePF2e[]` (prepared, excludes unresolvable)                                                                                                               | `src/module/actor/party/document.ts`                                                                                                                   |
| Compendium provenance      | `actor._stats.compendiumSource` (Foundry) and `actor.sourceId` getter (`duplicateSource ?? compendiumSource`)                                                                   | `src/module/actor/base.ts` line ~151                                                                                                                   |
| PWL setting                | world setting `pf2e.proficiencyVariant` (boolean) mirrored at `game.pf2e.settings.variants.pwol.enabled`                                                                        | `src/module/system/settings/variant-rules.ts` lines 96–103                                                                                             |
| System XP helper           | `game.pf2e.gm.calculateXP(partyLevel, partySize, npcLevels, hazards, { pwol })` returning `{ totalXP, encounterBudgets, rating, ratingXP, xpPerPlayer, partySize, partyLevel }` | `src/scripts/set-game-pf2e.ts` line ~95, `src/scripts/macros/xp/index.ts`                                                                              |

### Important behavioral differences vs. this module

- **`calculateXP` clamps out-of-range creatures** to ±4 (`Math.clamp` in `getXPFromMap`). This module does not:
  it marks them unsupported and reports an incomplete evaluation. The runtime cross-check therefore only
  compares totals when every creature is within −4..+4.
- **`calculateXP` budgets use `partySize × 20 × multiplier`** (`trivial 0.5, low 0.75, moderate 1, severe 1.5,
extreme 2`). For four characters this equals the rulebook table, but for other sizes it differs from the
  rulebook's per-character adjustments (e.g. Low for five characters: rulebook 80, system 75). This module
  uses the rulebook formula. The cross-check compares **creature XP totals**, not budgets.
- PF2e's encounter tracker uses the **rounded mean** of character levels as the party level
  (`src/module/encounter/document.ts`). This module requires an explicit policy for mixed-level parties.
- PWL creature XP values in the system (`xpVariantCreatureDifferences`) span −7..+7. When PWL is enabled this
  module delegates per-creature XP to `calculateXP` (one creature at a time) and labels the evaluation as a
  system calculation.

## 3. Foundry 13 document APIs (verified from the type definitions shipped in PF2e `types/foundry`)

| Item                                          | Verified                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TableResult` schema                          | `type` (`"text"` or `"document"`), `name`, `img`, `description`, `documentUuid`, `weight`, `range: [number, number]`, `drawn`, `flags` (`types/foundry/common/documents/table-result.d.mts`). `CONST.TABLE_RESULT_TYPES = { TEXT: "text", DOCUMENT: "document" }`. |
| `RollTable#roll({ roll, recursive, _depth })` | "only performs the roll and identifies the result"; returns `{ roll, results }`; does **not** post chat or mark results drawn. `recursive` defaults to true.                                                                                                       |
| `RollTable#draw(...)` / `#drawMany(...)`      | Accept `displayChat` and `recursive`; they formalize a draw (mark drawn, post chat). **This module never calls them.**                                                                                                                                             |
| `RollTable` fields                            | `formula`, `replacement`, `displayRoll`, `results` embedded collection.                                                                                                                                                                                            |
| `CompendiumCollection#getIndex({ fields })`   | Present.                                                                                                                                                                                                                                                           |
| `TokenDocument`                               | `actorLink`, `actorId`, `hidden`, `width`, `height` (grid units), `delta`; `getSize()`; `baseActor`, `isLinked`.                                                                                                                                                   |
| Grid                                          | `grid.isSquare / isHexagonal / isGridless`, `grid.size`, `getTopLeftPoint`, `getOffset`, `getAdjacentOffsets`; `CONST.GRID_TYPES.GRIDLESS = 0`, `SQUARE = 1`.                                                                                                      |
| `Combat`                                      | `createEmbeddedDocuments("Combatant", ...)`; `startCombat()` and `rollAll()` exist and are **never** called by this module.                                                                                                                                        |
| ApplicationV2                                 | `DEFAULT_OPTIONS` with `actions`, `HandlebarsApplicationMixin` with `PARTS`, `_prepareContext`, `_onRender`.                                                                                                                                                       |

## 4. Not verified (requires a running Foundry world)

These are isolated behind `src/foundry/*` adapters and are exercised by the Quench suite (`src/quench/tests.ts`) and the manual matrix (`docs/MANUAL-TESTS.md`).

1. That `RollTable#roll({ recursive: false })` leaves `drawn` untouched and posts no chat for a table with `replacement: false` (T17).
2. That unlinked tokens created from one world NPC have independent HP after damage in PF2e 7.x (T20).
3. That `game.pf2e.gm.calculateXP` is present with the signature above on the installed PF2e version (T25).
4. That the Party actor's `system.details.members` resolves to `party.members` as expected after world load.
5. That `_stats.compendiumSource` is populated on actors imported via `Actor.create(fromCompendium)` in the installed Foundry build (T19).
6. Placement geometry on hex and gridless scenes (warned, fallback used).
7. The ORC License notice wording in `LICENSE-ORC.md` (paizo.com unreachable from the build environment).

## 5. Runtime verification steps

1. Install Foundry VTT 13 (latest stable) and PF2e 7.x. Note both versions.
2. Install this module from the repository (`npm ci && npm run build`, then copy `module.json`, `dist/`, `lang/`, `styles/`, `templates/` into `Data/modules/pf2e-encounter-builder/`).
3. Install and enable the **Quench** module. Open the Quench panel and run the `pf2e-encounter-builder` suites.
4. Follow `docs/MANUAL-TESTS.md` for the remaining manual cases and record the Foundry build and PF2e version in the results table.
5. Only after all suites pass may `module.json`'s `compatibility.verified` be set, to the exact Foundry build used.

## 6. Test results in the build environment

Recorded at the end of each milestone (see git history and the final section of the README).
