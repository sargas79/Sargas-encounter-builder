/**
 * GM-authored themes, stored as a versioned flag on the module data JournalEntry (GM-only).
 */
import { DOCUMENT_NAMES, FLAGS, MODULE_ID } from "../constants.js";
import {
  emptyThemeStore,
  validateThemeStore,
  type CustomThemeRecord,
  type ThemeStoreV1,
} from "../core/schemas.js";
import { documentClass, ownershipLevels, randomID } from "./compat.js";

export class ThemeStoreService {
  #cache: ThemeStoreV1 | null = null;

  list(): CustomThemeRecord[] {
    return this.load().themes;
  }

  get(id: string): CustomThemeRecord | null {
    return this.list().find((t) => t.id === id) ?? null;
  }

  load(): ThemeStoreV1 {
    if (this.#cache) return this.#cache;
    const journal = this.#findJournal();
    const raw = journal?.getFlag(MODULE_ID, FLAGS.themes);
    if (raw) {
      const v = validateThemeStore(raw);
      if (v.ok) {
        this.#cache = v.value;
        return v.value;
      }
      console.warn(`${MODULE_ID} | Theme store invalid, starting empty`, v.errors);
    }
    this.#cache = emptyThemeStore();
    return this.#cache;
  }

  async save(theme: Omit<CustomThemeRecord, "id"> & { id?: string }): Promise<CustomThemeRecord> {
    if (!game.user.isGM) throw new Error("GM only");
    const store = structuredClone(this.load());
    const record: CustomThemeRecord = { ...theme, id: theme.id ?? randomID() };
    store.themes = [...store.themes.filter((t) => t.id !== record.id), record];
    await this.#write(store);
    return record;
  }

  async delete(id: string): Promise<void> {
    if (!game.user.isGM) throw new Error("GM only");
    const store = structuredClone(this.load());
    store.themes = store.themes.filter((t) => t.id !== id);
    await this.#write(store);
  }

  invalidate(): void {
    this.#cache = null;
  }

  async #write(store: ThemeStoreV1): Promise<void> {
    const journal = await this.#ensureJournal();
    await journal.update({
      [`flags.${MODULE_ID}.-=${FLAGS.themes}`]: null,
      [`flags.${MODULE_ID}.${FLAGS.themes}`]: store,
    });
    this.#cache = store;
  }

  #findJournal(): JournalEntryDocument | null {
    return game.journal.find((j) => j.getFlag(MODULE_ID, FLAGS.dataJournal) === true) ?? null;
  }

  async #ensureJournal(): Promise<JournalEntryDocument> {
    const existing = this.#findJournal();
    if (existing) return existing;
    const levels = ownershipLevels();
    return documentClass("JournalEntry").create({
      name: DOCUMENT_NAMES.dataJournal,
      ownership: { default: levels.NONE },
      flags: { [MODULE_ID]: { [FLAGS.dataJournal]: true, [FLAGS.themes]: emptyThemeStore() } },
    });
  }
}
