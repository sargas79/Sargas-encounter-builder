# Manual and in-Foundry test matrix

Record the environment for every run. Do not mark a case passed without it.

| Field               | Value |
| ------------------- | ----- |
| Foundry VTT build   |       |
| PF2e system version |       |
| Module version      |       |
| Quench version      |       |
| Tester / date       |       |

## A. Quench suites (automated inside Foundry)

1. Install and enable [Quench](https://foundryvtt.com/packages/quench).
2. Log in as a GM, open a scene, and open the Quench panel (sidebar dice icon → Quench).
3. Select all `PF2e Encounter Builder` batches and run. Each batch records the versions in its first test.

| Batch              | Cases                                                                                    | Needs                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| system integration | T25 (XP helper cross-check), PWL setting, `actor.level`, Party actor members, runtime T8 | a world with PF2e; a Party actor and a bestiary compendium make more cases run                           |
| deployment         | T19, T20, T21, T22                                                                       | an accessible bestiary compendium and a viewed scene; creates and deletes temporary actors/tokens/combat |
| tables             | T17, grammar rejection                                                                   | creates and deletes a temporary RollTable                                                                |
| persistence        | T18, tag store                                                                           | creates and deletes a temporary Journal Entry                                                            |

Run the **deployment** batch a second time logged in as a **player**: T22 must report that the builder refuses to open and writes are refused (open the Actors sidebar: no button is shown; `game.modules.get("sargas-encounter-builder")` exposes nothing writable).

## B. Manual cases

| #   | Case                        | Steps                                                                                                                                            | Expected                                                                                                                                  | Result |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M1  | Launcher                    | As GM open the Actors sidebar                                                                                                                    | "Encounter Builder" button present; as a player it is absent                                                                              |        |
| M2  | Linked party                | Party tab → select a PF2e Party actor → Link                                                                                                     | Members listed live with levels; toggling participation changes "Participating" and the target budget in the header                       |        |
| M3  | Mixed levels (T4)           | Party with two different levels                                                                                                                  | Red blocker "choose a policy"; evaluation disabled until a policy is chosen; "average rounded down" is labeled estimate                   |        |
| M4  | Missing actor (T4)          | Add an actor to a standalone profile, delete the actor                                                                                           | Row shown as missing; still listed; not counted                                                                                           |        |
| M5  | Level change (T3)           | Change a counted character's level on its sheet                                                                                                  | Header and evaluation update without reopening                                                                                            |        |
| M6  | Catalog (T8)                | Select a bestiary pack, search, add                                                                                                              | No world actor is created; Inspect opens the compendium sheet read-only                                                                   |        |
| M7  | Out-of-range                | Add a creature 6 levels above the party                                                                                                          | Row marked "above +4", evaluation incomplete, inferred "Beyond Extreme (unquantified)"                                                    |        |
| M8  | Generator (T9/T10)          | Generate Moderate with a seed; regenerate with the same seed                                                                                     | Same result; hard constraints visible in the result; impossible constraints give a reason                                                 |        |
| M9  | Replace one                 | Lock two entries, Replace the third                                                                                                              | Locked entries unchanged, third replaced                                                                                                  |        |
| M10 | Table editor                | Create a table, add rows: none 1–30, creatures 31–50 (`1d4+1`), patrol 51–65 (two creatures), tracks 66–80, discovery 81–95, nested table 96–100 | Validation passes; native result text shows readable summaries when the table is opened natively                                          |        |
| M11 | Overlap / gap               | Set two rows to overlapping ranges, then leave a gap                                                                                             | Error (save blocked) / warning                                                                                                            |        |
| M12 | Quantity grammar            | Enter `1d4+@abilities.str.mod` as a quantity                                                                                                     | Rejected with an error                                                                                                                    |        |
| M13 | Roll (T11/T12/T16)          | Roll the table several times                                                                                                                     | Trace shows the die, matched row, quantity rolls; narrative rows produce no creatures; no chat messages appear; no result is marked drawn |        |
| M14 | Classic too dangerous (T13) | Table with a level-15 creature, party level 1, Use as rolled                                                                                     | Creature loaded unchanged, evaluation says Beyond Extreme                                                                                 |        |
| M15 | Balanced variant (T14)      | Create balanced variant from M14                                                                                                                 | New encounter from the rolled creatures; variant diff shown after saving                                                                  |        |
| M16 | Cycle (T15)                 | Table A → B → A                                                                                                                                  | Roll stops with "cycle detected"; editor validation shows the cycle                                                                       |        |
| M17 | Encounter check (T15/T16)   | Table with check `1d6` on `1`; roll repeatedly                                                                                                   | "No encounter" when the check fails, no table roll in the trace                                                                           |        |
| M18 | No-replacement (T17)        | Table with replacement off; roll 10 times from the module                                                                                        | No result marked drawn; native Draw still works afterwards                                                                                |        |
| M19 | Save / reload (T18)         | Save an encounter, reload the world, open it                                                                                                     | Entries, notes, seed and saved evaluation intact; journal entry not visible to players                                                    |        |
| M20 | Recalculate (T18)           | Change the party, Recalculate                                                                                                                    | Saved snapshot unchanged until "Update saved evaluation" is confirmed                                                                     |        |
| M21 | Reuse (T19)                 | Deploy with "reuse"; deploy again                                                                                                                | Second run reuses the imported actor; a same-named actor without compendium source is not matched                                         |        |
| M22 | Independent HP (T20)        | Deploy 3 copies, damage one                                                                                                                      | Others unaffected; tokens unlinked                                                                                                        |        |
| M23 | Combat (T21)                | Deploy with "new combat"                                                                                                                         | Combat exists, not started, no initiative                                                                                                 |        |
| M24 | Partial failure (T23)       | Lock the destination scene so token creation fails (e.g. deploy to a scene with no room near the origin)                                         | Exact failure list; Cleanup removes only created documents                                                                                |        |
| M25 | Hex scene                   | Deploy on a hex grid                                                                                                                             | Warning shown; tokens placed; positions sensible                                                                                          |        |
| M26 | Non-GM (T22)                | As a player: no launcher; `game.settings.set("sargas-encounter-builder", …)` is refused by the server                                            | Writes refused                                                                                                                            |        |
| M27 | Debug cross-check (T25)     | Enable Debug mode, build a standard encounter                                                                                                    | No mismatch message; console shows none                                                                                                   |        |
| M28 | PWL                         | Enable Proficiency Without Level                                                                                                                 | Header shows the variant; evaluation labeled as system calculation (or unsupported if the helper is missing)                              |        |

## B2. 0.2.0 additions (flow, themes, style)

| #   | Case              | Steps                                                          | Expected                                                                                                                                                                    | Result |
| --- | ----------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M29 | Start dialog      | Click the dragon tool or the sidebar button                    | Dialog with party (Party actors first), threat segments, level policy, four mode cards; Start opens the workspace on the chosen tab                                         |        |
| M30 | Gating            | Start with a new empty standalone profile                      | Build/Tables/Deploy tabs disabled with a tooltip; Party tab shown; adding a character enables them                                                                          |        |
| M31 | Party strip       | Click the party name / a threat segment                        | Dialog reopens / target budget updates everywhere                                                                                                                           |        |
| M32 | Default packs     | Fresh world, open the builder                                  | All PF2e bestiary compendiums pre-selected; footer shows indexed creature count                                                                                             |        |
| M33 | Themed generation | Generate with "Surprise me", Any                               | Every creature shares the theme shown in the result pill; reroll keeps the theme; Re-theme changes it                                                                       |        |
| M34 | Shapes            | Generate Pack / Warband / Boss + minions / Mixed patrol / Lair | Shapes hold: pack = one stat block ×N; warband = one leader above ≥2 troops; boss ≥2 above minions (outsider boss flagged); patrol 2–5 distinct within two levels; lair = 1 |        |
| M35 | Locked theme      | Lock a goblin, Generate with Surprise me                       | Theme inferred from the lock; other creatures are goblins/humanoids                                                                                                         |        |
| M36 | Custom theme      | New theme with required trait `undead` and one explicit UUID   | Appears under "Your themes"; generation stays inside it; delete removes it                                                                                                  |        |
| M37 | Exclude           | Ban icon on a catalog row and on a draft row                   | Creature removed from the draft and never generated; chip under the generator allows it again                                                                               |        |
| M38 | Look & feel       | Compare with Wondrous Spellbook side by side                   | Same dark palette, violet accent, segments, pills, empty states; readable under Foundry light theme                                                                         |        |
| M39 | Table editor      | Open the editor                                                | Rows as cards, native rows read-only, validation badges inline                                                                                                              |        |

## C. Review items (T24)

- `git grep -i` for Paizo proper nouns in `src/`, `lang/`, `docs/`, `tests/`: none expected.
- No files under `packs/`; `module.json` declares no packs.
- `LICENSE-ORC.md` present; `src/rules/encounter-tables.ts` carries the license header.
- Source compendiums: after a full session, compendium documents are unchanged (compare `_stats.modifiedTime`).

## D. Setting `compatibility.verified`

Only after sections A–C pass on a given build, set `module.json` → `compatibility.verified` to that exact
Foundry build and record it in `docs/VERIFICATION.md` §6.
