# Changelog

## 0.2.0 (unreleased)

- Renamed the module to `sargas-encounter-builder` ("Sargas - Encounter Builder"). Worlds that used
  `pf2e-encounter-builder` 0.1.0 keep their journal entries; settings and flags under the old id are not
  migrated (0.1.0 was a pre-release used by the maintainer only).
- Targets Foundry VTT 14 and PF2e 8.x.
- Party-first flow: a start dialog asks for party, threat and mode; Build, Tables and Deploy are gated
  until the party resolves.
- Themed random generation: encounters are built inside a creature theme (type, family, environment),
  with archetypes (pack, warband, boss and minions, mixed patrol, lair) and GM-authored themes.
- Visual rebuild in the shared "Nocturne" style used by the other Sargas modules.

## 0.1.0

- First release: party profiles, budgets, compendium catalog, balanced generation, classic encounter
  tables, saved encounters, deployment.
