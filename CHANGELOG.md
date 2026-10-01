# Changelog

## 0.2.1

- **Upgrading from 0.1.0.** The old id `pf2e-encounter-builder` is also used by an unrelated module on
  the Foundry package registry, so Foundry's updater fetches that package instead of ours. Uninstall
  `pf2e-encounter-builder` and install this module from its manifest URL (see README).
- The one-time migration that copies 0.1.0 data forward now validates every record and skips entirely
  when a module by another author is installed under the old id, so foreign data is never imported.

## 0.2.0

- Renamed the module to `sargas-encounter-builder` ("Sargas - Encounter Builder"). A migration copies
  saved encounters, tags and table metadata from the 0.1.0 flag namespace; world settings (party
  profiles, selected packs) are not carried over and are set up again by the start dialog.
- Targets Foundry VTT 14 and PF2e 8.x.
- Party-first flow: a start dialog asks for party, threat and mode; Build, Tables and Deploy are gated
  until the party resolves.
- Themed random generation: encounters are built inside a creature theme (type, family, environment),
  with archetypes (pack, warband, boss and minions, mixed patrol, lair) and GM-authored themes.
- Visual rebuild in the shared "Nocturne" style used by the other Sargas modules.

## 0.1.0

- First release: party profiles, budgets, compendium catalog, balanced generation, classic encounter
  tables, saved encounters, deployment.
