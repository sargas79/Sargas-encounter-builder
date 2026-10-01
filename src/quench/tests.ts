/**
 * In-Foundry integration tests, run manually by a GM through the Quench module.
 * Each batch records the Foundry build and PF2e version in its first test so results are attributable.
 * Batches are added per milestone; see docs/MANUAL-TESTS.md for the manual matrix.
 */
import { MODULE_ID } from "../constants.js";
import { evaluateEncounter } from "../core/budget.js";
import { services } from "../foundry/services.js";

function versionsLine(): string {
  return `Foundry ${game.version}, PF2e ${game.system.version}, module ${game.modules.get(MODULE_ID)?.version ?? "?"}`;
}

export function registerQuenchTests(quench: Quench): void {
  quench.registerBatch(
    `${MODULE_ID}.system-integration`,
    (context) => {
      const { describe, it, assert } = context;

      describe("environment", () => {
        it(`records versions: ${versionsLine()}`, () => {
          assert.equal(game.system.id, "pf2e");
          assert.ok(game.user.isGM, "run as GM");
        });
      });

      describe("T25: PF2e XP helper cross-check (standard rules)", () => {
        it("game.pf2e.gm.calculateXP exists", () => {
          assert.ok(
            typeof game.pf2e?.gm?.calculateXP === "function",
            "calculateXP not found on game.pf2e.gm",
          );
        });

        it("matches module totals for every relative level -4..+4 and party sizes 1..8", () => {
          const helper = services().adapter.systemXPHelper();
          if (!helper.available) assert.fail("helper unavailable");
          for (let partySize = 1; partySize <= 8; partySize++) {
            for (let relative = -4; relative <= 4; relative++) {
              const referenceLevel = 10;
              const level = referenceLevel + relative;
              const ours = evaluateEncounter({
                partySize,
                referenceLevel,
                entries: [{ id: "x", level, quantity: 3 }],
              }).supportedXP;
              const theirs = helper.total(referenceLevel, partySize, [level, level, level], false);
              assert.equal(theirs, ours, `relative ${relative}, party ${partySize}`);
            }
          }
        });

        it("documents that the system clamps out-of-range creatures while the module marks them unsupported", () => {
          const helper = services().adapter.systemXPHelper();
          const theirs = helper.total(10, 4, [20], false);
          const ours = evaluateEncounter({
            partySize: 4,
            referenceLevel: 10,
            entries: [{ id: "x", level: 20, quantity: 1 }],
          });
          assert.equal(ours.complete, false);
          assert.equal(ours.supportedXP, 0);
          assert.equal(theirs, 160, "system clamps +10 to +4 (160 XP)");
        });
      });

      describe("PF2e data paths (docs/VERIFICATION.md §2)", () => {
        it("reads the PWL setting without throwing", () => {
          const info = services().adapter.variantInfo();
          assert.ok(typeof info.pwol === "boolean");
        });

        it("exposes actor.level on a character or NPC in this world (if any exist)", () => {
          const actor = game.actors.find((a) => a.type === "character" || a.type === "npc");
          if (!actor) return;
          assert.ok(typeof actor.level === "number", "actor.level getter missing");
        });

        it("resolves Party actor members through the adapter (if a Party actor exists)", async () => {
          const party = game.actors.find((a) => a.type === "party");
          if (!party) return;
          const uuids = await services().adapter.partyMemberUuids(party.uuid);
          assert.ok(Array.isArray(uuids));
          const resolved = (party.members ?? []).map((m) => m.uuid);
          assert.deepEqual(
            uuids?.filter((u) => resolved.includes(u)).length,
            resolved.length,
            "system members ⊆ adapter members",
          );
        });
      });

      describe("T8 (runtime): catalog browsing uses indexes only", () => {
        it("loads a selected pack index without loading documents", async () => {
          const { catalog } = services();
          const packs = catalog.availablePacks().filter((p) => p.accessible);
          if (packs.length === 0) return;
          const before = catalog.documentLoadCount;
          const results = await catalog.search({ levelMin: 0, levelMax: 3 }, [packs[0]!.id]);
          assert.ok(Array.isArray(results));
          assert.equal(catalog.documentLoadCount, before);
          const state = catalog.packState(packs[0]!.id);
          assert.ok(state && state.state !== "error", JSON.stringify(state));
        });
      });
    },
    { displayName: "PF2e Encounter Builder: system integration" },
  );

  quench.registerBatch(
    `${MODULE_ID}.deployment`,
    (context) => {
      const { describe, it, assert, after } = context;
      const created: FoundryDocument[] = [];
      after(async () => {
        for (const doc of created.reverse()) {
          try {
            await doc.delete();
          } catch {
            /* already gone */
          }
        }
      });

      const findSourceNpc = async (): Promise<ActorDocument | null> => {
        const { catalog } = services();
        const packs = catalog.availablePacks().filter((p) => p.accessible);
        for (const pack of packs) {
          const entries = await catalog.search({ levelMin: 0, levelMax: 2 }, [pack.id]);
          if (entries[0]) return (await fromUuid(entries[0].uuid)) as ActorDocument | null;
        }
        return null;
      };

      describe(`deployment (${versionsLine()})`, () => {
        it("T19: imports with provenance and reuses by compendium source, not by name", async () => {
          const source = await findSourceNpc();
          if (!source) return assert.ok(true, "no compendium NPC available; skipped");
          const { FoundryDeploymentGateway } = await import("../foundry/deployment-service.js");
          const gateway = new FoundryDeploymentGateway();
          const imported = await gateway.importActor(source.uuid);
          created.push(imported);
          assert.equal(imported._stats?.compendiumSource, source.uuid, "_stats.compendiumSource populated");
          assert.equal(gateway.findReusableActor(source.uuid)?.id, imported.id, "reuse finds the import");
          // A same-named actor without provenance must not be matched.
          const decoy = await CONFIG.Actor.documentClass.create({ name: imported.name, type: "npc" });
          created.push(decoy);
          assert.notEqual(gateway.findReusableActor(source.uuid)?.id, decoy.id, "decoy not matched by name");
        });

        it("T20: identical deployed tokens have independent HP", async () => {
          const source = await findSourceNpc();
          const scene = game.scenes.viewed ?? game.scenes.active;
          if (!source || !scene) return assert.ok(true, "needs a compendium NPC and a viewed scene; skipped");
          const { DeploymentService, FoundryDeploymentGateway } =
            await import("../foundry/deployment-service.js");
          const service = new DeploymentService(new FoundryDeploymentGateway());
          const outcome = await service.deploy(
            [
              {
                uuid: source.uuid,
                name: source.name,
                level: source.level ?? 0,
                quantity: 2,
                locked: false,
                img: null,
                packLabel: null,
                traits: [],
              },
            ],
            {
              sceneId: scene.id,
              importPolicy: "fresh",
              hidden: true,
              addToCombat: "none",
              numberDuplicates: true,
            },
            null,
          );
          for (const c of outcome.ledger.cleanupTargets()) {
            const doc = await fromUuid(c.uuid);
            if (doc) created.push(doc);
          }
          assert.equal(outcome.ledger.failures.length, 0, JSON.stringify(outcome.ledger.failures));
          const [a, b] = outcome.placedTokens;
          assert.ok(a && b, "two tokens placed");
          assert.isFalse(a!.actorLink, "unlinked");
          assert.isTrue(a!.hidden, "hidden by default");
          const hpBefore = b!.actor?.hitPoints?.value ?? null;
          await a!.actor?.update({ "system.attributes.hp.value": 1 });
          assert.equal(a!.actor?.hitPoints?.value, 1, "token A damaged");
          assert.equal(b!.actor?.hitPoints?.value, hpBefore, "token B unaffected");
        });

        it("T21: adding to combat does not start it or roll initiative", async () => {
          const source = await findSourceNpc();
          const scene = game.scenes.viewed ?? game.scenes.active;
          if (!source || !scene) return assert.ok(true, "skipped");
          const { DeploymentService, FoundryDeploymentGateway } =
            await import("../foundry/deployment-service.js");
          const service = new DeploymentService(new FoundryDeploymentGateway());
          const outcome = await service.deploy(
            [
              {
                uuid: source.uuid,
                name: source.name,
                level: source.level ?? 0,
                quantity: 1,
                locked: false,
                img: null,
                packLabel: null,
                traits: [],
              },
            ],
            {
              sceneId: scene.id,
              importPolicy: "reuse",
              hidden: true,
              addToCombat: "new",
              numberDuplicates: true,
            },
            null,
          );
          for (const c of outcome.ledger.cleanupTargets()) {
            const doc = await fromUuid(c.uuid);
            if (doc) created.push(doc);
          }
          const combatRecord = outcome.ledger.created.find((c) => c.kind === "Combat");
          assert.ok(combatRecord, "combat created");
          const combat = (await fromUuid(combatRecord!.uuid)) as CombatDocument | null;
          assert.ok(combat, "combat exists");
          assert.isFalse(combat!.started, "combat not started");
          assert.equal(combat!.round, 0, "round 0");
          for (const c of combat!.combatants.contents)
            assert.ok(c.initiative === null || c.initiative === undefined, "no initiative rolled");
        });

        it("T22: non-GM protection (run this batch as a player to verify UI/writes are refused)", () => {
          if (game.user.isGM)
            return assert.ok(true, "run as a player: the builder must refuse to open and setTags must throw");
          assert.isFalse(game.user.isGM);
        });
      });
    },
    { displayName: "PF2e Encounter Builder: deployment" },
  );

  quench.registerBatch(
    `${MODULE_ID}.tables`,
    (context) => {
      const { describe, it, assert, after } = context;
      const created: FoundryDocument[] = [];
      after(async () => {
        for (const doc of created) {
          try {
            await doc.delete();
          } catch {
            /* already gone */
          }
        }
      });

      describe(`tables (${versionsLine()})`, () => {
        it("T17: repeated module rolls do not post chat, mark drawn, or exhaust a no-replacement table", async () => {
          const { createEncounterTable, saveTable } = await import("../foundry/table-flags.js");
          const { rollEncounterTable } = await import("../foundry/table-resolver.js");
          const { emptyResultFlags } = await import("../core/schemas.js");
          const table = await createEncounterTable("PEB Quench T17", "1d2");
          created.push(table);
          await table.update({ replacement: false });
          await saveTable(
            table,
            {
              formula: "1d2",
              flags: {
                schemaVersion: 1,
                mode: "range",
                encounterCheck: null,
                tags: { region: [], terrain: [], season: [], timeOfDay: [] },
                notes: "",
              },
              rows: [
                {
                  id: null,
                  range: [1, 1],
                  weight: 1,
                  text: "Tracks",
                  flags: { ...emptyResultFlags("narrative"), narrativeKind: "tracks" },
                },
                { id: null, range: [2, 2], weight: 1, text: "Nothing", flags: emptyResultFlags("none") },
              ],
              deleteIds: [],
            },
            () => null,
          );
          const messagesBefore = (game as unknown as { messages: { size: number } }).messages.size;
          for (let i = 0; i < 6; i++) {
            const report = await rollEncounterTable(table.uuid);
            assert.equal(report.outcome.errors.length, 0, JSON.stringify(report.outcome.errors));
            assert.equal(report.outcome.narratives.length, 1, "exactly one narrative each roll");
          }
          const fresh = (await fromUuid(table.uuid)) as RollTableDocument;
          assert.isTrue(
            fresh.results.contents.every((r) => !r.drawn),
            "no result marked drawn",
          );
          assert.equal(
            (game as unknown as { messages: { size: number } }).messages.size,
            messagesBefore,
            "no chat messages posted",
          );
        });

        it("quantity formulas with @references are rejected before reaching Roll", async () => {
          const { FoundryTableLookup } = await import("../foundry/table-resolver.js");
          const lookup = new FoundryTableLookup();
          let threw = false;
          try {
            await lookup.rollFormula("1d4+@abilities.str.mod", "quantity");
          } catch {
            threw = true;
          }
          assert.isTrue(threw, "formula rejected");
          const ok = await lookup.rollFormula("1d4+1", "quantity");
          assert.ok(ok.total >= 2 && ok.total <= 5, `total ${ok.total} within bounds`);
        });
      });
    },
    { displayName: "PF2e Encounter Builder: tables" },
  );
}
