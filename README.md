# PF2e Encounter Builder (Foundry VTT module)

A GM workspace for the Pathfinder Second Edition system on Foundry VTT: party profiles, XP budgets,
compendium creature browsing, balanced random generation, classic encounter tables, saved encounters,
and explicit scene deployment.

- Module ID: `sargas-encounter-builder`
- Target: Foundry VTT 14 (13 minimum) with the PF2e system (7.x or later). **Not yet runtime-verified**;
  see [Status](#status) and [`docs/VERIFICATION.md`](docs/VERIFICATION.md).
- GM only. Players never see the application or the module's documents.
- No creature content is bundled. Creatures come from the compendiums installed in your world.

## Installation

**From a release (recommended):** in Foundry's _Add-on Modules_ → _Install Module_, paste this manifest URL:

```
https://github.com/sargas79/Sargas-encounter-builder/releases/latest/download/module.json
```

Releases are on the [GitHub releases page](https://github.com/sargas79/Sargas-encounter-builder/releases).

**From source:** build it once:

```bash
npm ci
npm run build
```

Then copy these into `Data/modules/sargas-encounter-builder/`:

```
module.json  dist/  lang/  styles/  templates/
```

Enable the module in your world. A GM sees an **Encounter Builder** button in the Actors sidebar header.

Development commands: `npm test` (Vitest), `npm run lint`, `npm run typecheck`, `npm run build`,
`npm run format`.

## Workflow

Party → Build (manual, generated, or from a table) → evaluate → save and/or deploy.

### 1. Party

Open the **Party** tab.

- **Link a PF2e Party actor** (recommended): members are read live from the Party actor. Toggle who
  participates in this encounter without editing the actor.
- Or create a **standalone profile** and add character actors by drag-and-drop or the picker.

Rules the module applies:

- Only participating **character** actors count toward party size. Familiars and companions are listed but
  not counted. An NPC ally counts only if you toggle the "count as party member" override.
- If every counted character has the same level, that is the **reference level**. Mixed levels block
  evaluation until you choose a policy: average rounded down (labeled as an estimate), highest, lowest,
  or a manual level.
- Missing or inaccessible actors are flagged, never dropped or replaced.
- The header always shows the party, participants, levels, reference level and policy, selected threat
  and target budget.

### 2. Compendium selection

On the **Build** tab, expand **Source compendiums** and tick the Actor compendiums to browse. Only `npc`
actors with a level are indexed. Browsing uses compendium indexes only; a full document is loaded only
when you press **Inspect** or when you import. Use the refresh button after installing new content.

Custom tags (`family:goblinoid`, `environment:forest`, …) are stored on a GM-only "Encounter Builder
Data" journal entry and can be used as filters and by the generator.

### 3. Building an encounter

- **Manual**: search, filter, add, change quantities, lock entries. The evaluation panel shows the selected
  threat, target, supported XP, difference, completeness and the inferred threat. Unusual compositions
  produce warnings, never rejections.
- **Balanced random generation**: set relative level bounds, creature count bounds, composition
  (unrestricted, solo, pair, group, boss with support), duplicate cap and optional seed, then **Generate**.
  Locked entries are kept; **Replace** re-rolls a single entry. Hard constraints are never loosened: if no
  combination fits you get the reason (locked entries over budget, nothing in the level bounds, no feasible
  composition, enumeration cap…). The generator prefers exact fits, then near fits (within the tier's
  per-character adjustment), and only otherwise returns the closest under-budget result, labeled.
- **Tables**: see below.

### 4. Encounter tables

Tables are native Foundry **RollTables** with module metadata in flags. On the **Tables** tab, pick a table
(or create one) and open the **editor**:

- **Formula** such as `1d100`, `1d20`, `2d6`.
- **Mode**: _explicit dice ranges_ (authored ranges are never normalized) or _weights_ (ranges are derived
  only when you press **Derive ranges**).
- **Rows**: creatures (one or more creature UUIDs each with a fixed count or a dice quantity like `1d4+1`),
  another table, narrative (tracks, travelers, discovery, weather, other), no encounter, or a party-scaled
  template. Drag Actors, RollTables or Journal entries onto a row.
- Optional **encounter check** (e.g. `1d6`, occurs on `1`), region/terrain/season/time tags, GM notes and
  a journal link per row.
- Validation flags malformed formulas, overlapping ranges, gaps, rows outside the formula's results,
  zero weights, missing references, self references and cycles. Saving is blocked on errors.
- Native rows without module metadata are shown read-only; **Configure** converts one.
- Quantity formulas accept only integers, `NdM`, `kh`/`kl`, `+ - *` and parentheses. `@` references and
  functions are rejected.

Rolling a table from the Tables tab uses the module resolver: it never posts to chat, never marks results
drawn, never imports and never changes documents. Repeated rolls therefore cannot exhaust a no-replacement
table (a warning explains the difference from native draws). Nested tables are resolved by the module with
cycle detection and a depth limit; per-entry and total creature limits are module settings. The full
**trace** (check, table, dice, matched row, nested results, quantity rolls, unavailable sources) is shown.

Policies:

- **Use as rolled (classic)**: the rolled creatures and quantities go into the builder unchanged, and the
  evaluation warns if they are too dangerous. Nothing is scaled silently.
- **Generate for party (template)**: only for template rows, which define candidates/traits, level bounds,
  composition and optional threat. Other results show "not scalable".
- **Create balanced variant**: builds a separate encounter from the rolled creatures using the generator,
  keeps the original roll in the trace, and records what changed.

### 5. Saving

**Save current encounter** stores a recipe as a GM-private Journal Entry in the folder
"Encounter Builder: Saved Encounters": creatures and quantities, locks, notes, origin, generation seed and
inputs, table trace, variant diff, and an **evaluation snapshot** (party, levels, reference level and
policy, threat, target, totals, inferred threat, time).

On the **Saved** tab you can open a recipe (missing sources are reported, not replaced), **recalculate** it
for the current party (shown beside the saved snapshot, never overwriting it unless you press _Update saved
evaluation_), update it from the builder, edit notes, rename, duplicate and delete.

### 6. Deployment

The **Deploy** tab separates the steps and shows a preview first:

| Action           | Effect                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Add to encounter | reference and quantity only                                            |
| Inspect          | opens the source creature                                              |
| Import & place   | creates world actors (or reuses them) and tokens on the selected scene |
| Add to combat    | optional; adds the placed tokens to the active or a new Combat         |

- **Reuse existing** matches world actors by compendium source (`_stats.compendiumSource`), never by name.
  **Fresh copy** always imports. Imports carry provenance.
- Tokens are **unlinked** (independent HP and conditions), **hidden by default**, numbered
  ("Wolf 1", "Wolf 2") when more than one.
- Placement: click **Pick on canvas** to choose an origin (default: scene center). Tokens are placed on a
  square spiral of free cells, respecting token size and scene bounds. Hex and gridless scenes get a
  warning and a best-effort fallback. If tokens do not fit, deployment is blocked and says how many fit.
- Combat is never started, initiative is never rolled, tokens are never revealed, XP is never awarded.
- Every document the operation created is tracked. On partial failure you get the exact list and a
  **cleanup** that deletes only those documents, never reused actors or pre-existing tokens.

## Budget rules

Target budget = `base + (party size − 4) × per-character adjustment`:

| Threat   | Four characters | Per character |
| -------- | --------------: | ------------: |
| Trivial  | 40 XP (ceiling) |            10 |
| Low      |              60 |            20 |
| Moderate |              80 |            20 |
| Severe   |             120 |            30 |
| Extreme  |             160 |            40 |

A tier whose target is 0 or less for the party size (for example Low for a single character) is shown as
unavailable. Creature XP by level relative to the reference level: −4: 10, −3: 15, −2: 20, −1: 30, 0: 40,
+1: 60, +2: 80, +3: 120, +4: 160. Creatures outside −4..+4 are **not counted, clamped or extrapolated**:
the evaluation is marked incomplete and lists them.

Construction XP is not an award. The module never awards XP.

### Inferred threat (normative)

Given the supported XP total and the party size:

1. If any creature is above +4 → **Beyond Extreme (unquantified)**.
2. Else if total > Extreme target → **Beyond Extreme**.
3. Else if total ≤ Trivial target → **Trivial**.
4. Else the **lowest available tier whose target ≥ total** (90 XP for four characters → Severe; exactly 80
   → Moderate).
5. Creatures below −4 only add "(negligible creatures not counted)".

The inferred threat is always labeled separately from the GM-selected target threat.

### Variant rules

If **Proficiency Without Level** is enabled and the PF2e system exposes `game.pf2e.gm.calculateXP`, per-creature
XP is taken from the system and the evaluation is labeled as a system calculation. Otherwise a warning says the
variant is unsupported; the module never substitutes an invented formula. With **Debug mode** on, the module
also cross-checks its standard totals against the system helper and reports any mismatch.

## Status

| Area                              | State                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and mocked integration tests | 130 passing (`npm test`), see `tests/`                                                                                                                         |
| Lint, typecheck, build            | passing                                                                                                                                                        |
| Runtime in Foundry                | **not executed in the build environment** — run the Quench suites and the manual matrix (`docs/MANUAL-TESTS.md`) and record the Foundry build and PF2e version |

Test cases T1–T25 from the specification map to: T1, T2, T5, T6, T7 (`tests/budget.test.ts`), T3, T4
(`tests/party.test.ts`), T8 (`tests/catalog.test.ts` + Quench), T9, T10 (`tests/generator.test.ts`),
T11–T16 (`tests/tables.test.ts`), T17 (Quench), T18 (`tests/repository.test.ts` + Quench), T19, T21, T23
(`tests/deployment.test.ts`), T19–T22 (Quench), T24 (review, see below), T25 (Quench).

## Known limitations

- Hazards, elite/weak adjustments, scheduled regional encounter checks and conditional table rules are not
  implemented and have no controls. Budget functions accept an (always empty) hazard list for later use.
- Placement supports square grids; hex and gridless scenes use a pixel-spiral fallback with a warning.
- The generator enumerates level combinations with a cap (50,000); very wide count ranges on large catalogs
  can hit it and report so.
- Weight-mode tables roll `1d<total weight>`; native Foundry draws on the same table use its own formula
  unless you press **Derive ranges**.
- Party-scaled generation requires a template row; arbitrary narrative or creature rows are not scaled.
- Animal companions and eidolons are detected heuristically (companion flag or `minion`/`eidolon` trait);
  verify on your PF2e version.

## Licensing

Code, templates, styles, tests and documentation: MIT (`LICENSE`). The encounter-building game mechanics in
`src/rules/encounter-tables.ts` are ORC Licensed Material from _Pathfinder GM Core_; see `LICENSE-ORC.md`
for the ORC Notice and attribution. No Paizo Reserved Material is included; example names in tests and
docs are invented. Archives of Nethys is referenced for reading only and is never fetched by the module.
