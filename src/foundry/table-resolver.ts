/**
 * Foundry port for the pure table resolver.
 *
 *  - Dice go through Foundry's Roll (validated first against the allowlist grammar).
 *  - Table documents are read through fromUuid; nothing is drawn, posted to chat, or mutated.
 *  - Creature references resolve through the catalog index (compendium) or fromUuid (world) without importing.
 */
import { MODULE_ID } from "../constants.js";
import { validateFormula } from "../core/dice-grammar.js";
import {
  resolveTable,
  type CreatureRef,
  type TableLookup,
  type TableModel,
  type TableOutcome,
} from "../core/table-model.js";
import { RollClass } from "./compat.js";
import { services } from "./services.js";
import { tableLimits } from "./settings.js";
import { tableToModel } from "./table-flags.js";

export class FoundryTableLookup implements TableLookup {
  async getTable(uuid: string): Promise<TableModel | null> {
    const doc = (await fromUuid(uuid)) as RollTableDocument | null;
    if (!doc || doc.documentName !== "RollTable") return null;
    return tableToModel(doc);
  }

  async rollFormula(
    formula: string,
    _purpose: "table" | "quantity" | "check",
  ): Promise<{ total: number; detail: string }> {
    const validation = validateFormula(formula);
    if (!validation.ok) throw new Error(`formula rejected: ${validation.error}`);
    const Roll = RollClass();
    // No roll data is passed: the grammar forbids @references, so nothing can be interpolated.
    const roll = await new Roll(formula).evaluate();
    const total = Number(roll.total ?? 0);
    const detail = roll.dice
      .map(
        (d) =>
          `d${d.faces}[${d.results
            .filter((r) => r.active)
            .map((r) => r.result)
            .join(",")}]`,
      )
      .join(" ");
    return { total, detail: detail || formula };
  }

  async resolveCreature(uuid: string): Promise<CreatureRef | null> {
    const { catalog } = services();
    const entry = await catalog.locate(uuid);
    if (entry)
      return {
        uuid: entry.uuid,
        name: entry.name,
        level: entry.level,
        img: entry.img,
        traits: entry.traits,
        packLabel: entry.packLabel,
      };
    try {
      const doc = (await fromUuid(uuid)) as ActorDocument | null;
      if (!doc || doc.documentName !== "Actor" || doc.type !== "npc") return null;
      return {
        uuid,
        name: doc.name,
        level: typeof doc.level === "number" ? doc.level : null,
        img: doc.img ?? null,
        traits: Array.isArray(doc.system?.traits?.value) ? doc.system.traits.value : [],
        packLabel: doc.pack ?? null,
      };
    } catch {
      return null;
    }
  }
}

export interface TableRollReport {
  outcome: TableOutcome;
  tableUuid: string;
  tableName: string;
  /** Warning when the table uses no-replacement draws natively; module rolls do not consume results. */
  replacementWarning: boolean;
  rolledAt: number;
}

export async function rollEncounterTable(uuid: string): Promise<TableRollReport> {
  const doc = (await fromUuid(uuid)) as RollTableDocument | null;
  if (!doc || doc.documentName !== "RollTable") throw new Error(`${uuid} is not a RollTable`);
  const outcome = await resolveTable(uuid, new FoundryTableLookup(), tableLimits());
  const replacementWarning = !doc.replacement && doc.results.contents.some((r) => r.drawn);
  if (replacementWarning)
    console.info(
      `${MODULE_ID} | ${doc.name} uses no-replacement draws; module rolls do not consume results.`,
    );
  return { outcome, tableUuid: uuid, tableName: doc.name, replacementWarning, rolledAt: Date.now() };
}

/** World RollTables, with module-configured ones first. */
export function listEncounterTables(): {
  uuid: string;
  name: string;
  configured: boolean;
  formula: string;
}[] {
  return game.tables.contents
    .map((t) => ({
      uuid: t.uuid,
      name: t.name,
      configured: !!t.getFlag(MODULE_ID, "table"),
      formula: t.formula,
    }))
    .sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));
}
