/**
 * EncounterRepository: saved encounter recipes as JournalEntry documents in a module folder,
 * GM-private by default, with data in a versioned flag.
 */
import { DOCUMENT_NAMES, FLAGS, MODULE_ID } from "../constants.js";
import { validateRecipe, type Recipe } from "../core/schemas.js";
import { documentClass, ownershipLevels } from "./compat.js";

export interface RecipeRecord {
  id: string;
  uuid: string;
  recipe: Recipe;
}

/** Port so the repository logic can be exercised without Foundry. */
export interface RecipeStore {
  list(): { id: string; uuid: string; raw: unknown }[];
  create(name: string, recipe: Recipe): Promise<{ id: string; uuid: string }>;
  update(id: string, name: string, recipe: Recipe): Promise<void>;
  delete(id: string): Promise<void>;
}

export class EncounterRepository {
  constructor(private readonly store: RecipeStore) {}

  list(): RecipeRecord[] {
    const out: RecipeRecord[] = [];
    for (const { id, uuid, raw } of this.store.list()) {
      const v = validateRecipe(raw);
      if (v.ok) out.push({ id, uuid, recipe: v.value });
      else console.warn(`${MODULE_ID} | ignoring invalid recipe ${id}`, v.errors);
    }
    return out.sort((a, b) => b.recipe.updatedAt - a.recipe.updatedAt);
  }

  get(id: string): RecipeRecord | null {
    return this.list().find((r) => r.id === id) ?? null;
  }

  async save(recipe: Recipe): Promise<RecipeRecord> {
    this.#assertGM();
    const v = validateRecipe(recipe);
    if (!v.ok) throw new Error(`invalid recipe: ${v.errors.join(", ")}`);
    const { id, uuid } = await this.store.create(recipe.name, recipe);
    return { id, uuid, recipe };
  }

  async update(id: string, recipe: Recipe): Promise<void> {
    this.#assertGM();
    const v = validateRecipe(recipe);
    if (!v.ok) throw new Error(`invalid recipe: ${v.errors.join(", ")}`);
    await this.store.update(id, recipe.name, { ...recipe, updatedAt: Date.now() });
  }

  async rename(id: string, name: string): Promise<void> {
    const record = this.get(id);
    if (record) await this.update(id, { ...record.recipe, name: name.trim() || record.recipe.name });
  }

  async delete(id: string): Promise<void> {
    this.#assertGM();
    await this.store.delete(id);
  }

  #assertGM(): void {
    if (typeof game !== "undefined" && !game.user.isGM) throw new Error("GM only");
  }
}

/* -------------------------------------------- */
/*  Foundry store                               */
/* -------------------------------------------- */

export class JournalRecipeStore implements RecipeStore {
  list(): { id: string; uuid: string; raw: unknown }[] {
    return game.journal
      .filter((j) => !!j.getFlag(MODULE_ID, FLAGS.recipe))
      .map((j) => ({ id: j.id, uuid: j.uuid, raw: j.getFlag(MODULE_ID, FLAGS.recipe) }));
  }

  async create(name: string, recipe: Recipe): Promise<{ id: string; uuid: string }> {
    const folder = await this.#ensureFolder();
    const levels = ownershipLevels();
    const journal: JournalEntryDocument = await documentClass("JournalEntry").create({
      name,
      folder: folder?.id ?? null,
      ownership: { default: levels.NONE },
      flags: { [MODULE_ID]: { [FLAGS.recipe]: recipe } },
      pages: [{ name: "Summary", type: "text", text: { content: summaryHtml(recipe), format: 1 } }],
    });
    return { id: journal.id, uuid: journal.uuid };
  }

  async update(id: string, name: string, recipe: Recipe): Promise<void> {
    const journal = game.journal.get(id);
    if (!journal) throw new Error(`recipe ${id} not found`);
    await journal.update({ name, [`flags.${MODULE_ID}.${FLAGS.recipe}`]: recipe });
    const page = journal.pages.contents[0];
    if (page)
      await journal.updateEmbeddedDocuments("JournalEntryPage", [
        { _id: page.id, "text.content": summaryHtml(recipe) },
      ]);
  }

  async delete(id: string): Promise<void> {
    const journal = game.journal.get(id);
    if (journal) await journal.delete();
  }

  async #ensureFolder(): Promise<FolderDocument | null> {
    const existing = game.folders.find(
      (f) => f.type === "JournalEntry" && f.name === DOCUMENT_NAMES.recipeFolder,
    );
    if (existing) return existing;
    try {
      return await documentClass("Folder").create({
        name: DOCUMENT_NAMES.recipeFolder,
        type: "JournalEntry",
      });
    } catch {
      return null;
    }
  }
}

function summaryHtml(recipe: Recipe): string {
  const rows = recipe.entries
    .map((e) => `<li>${escape(e.name)} (level ${e.level}) × ${e.quantity}</li>`)
    .join("");
  const ev = recipe.evaluation;
  const evText = ev
    ? `<p>Saved evaluation: ${escape(ev.partyName)} (${ev.partySize} × level ${ev.referenceLevel}), ${ev.supportedXP} XP, inferred ${escape(ev.inferredLabel)}${ev.complete ? "" : " (incomplete)"}.</p>`
    : "";
  return `<p><em>Managed by PF2e Encounter Builder. Edit it from the Encounter Builder's Saved tab.</em></p><ul>${rows}</ul>${evText}${recipe.notes ? `<p>${escape(recipe.notes)}</p>` : ""}`;
}

function escape(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
