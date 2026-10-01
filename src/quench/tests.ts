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
}
