/**
 * Custom creature tags, stored as a versioned flag on the single module data JournalEntry.
 * GM-only ownership; players never see it.
 */
import { DOCUMENT_NAMES, FLAGS, MODULE_ID } from "../constants.js";
import { emptyTagStore, validateTagStore, type TagStore } from "../core/schemas.js";
import { documentClass, ownershipLevels } from "./compat.js";

export class TagStoreService {
  #cache: TagStore | null = null;

  tagsFor(uuid: string): string[] {
    return this.load().tags[uuid] ?? [];
  }

  allTags(): string[] {
    const set = new Set<string>();
    for (const tags of Object.values(this.load().tags)) for (const t of tags) set.add(t);
    return [...set].sort();
  }

  load(): TagStore {
    if (this.#cache) return this.#cache;
    const journal = this.#findJournal();
    const raw = journal?.getFlag(MODULE_ID, FLAGS.tags);
    if (raw) {
      const v = validateTagStore(raw);
      if (v.ok) {
        this.#cache = v.value;
        return v.value;
      }
      console.warn(`${MODULE_ID} | Tag store invalid, starting empty`, v.errors);
    }
    this.#cache = emptyTagStore();
    return this.#cache;
  }

  async setTags(uuid: string, tags: string[]): Promise<void> {
    if (!game.user.isGM) throw new Error("GM only");
    const store = structuredClone(this.load());
    if (tags.length) store.tags[uuid] = [...new Set(tags)].sort();
    else delete store.tags[uuid];
    const journal = await this.#ensureJournal();
    await journal.setFlag(MODULE_ID, FLAGS.tags, store);
    this.#cache = store;
  }

  invalidate(): void {
    this.#cache = null;
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
      flags: { [MODULE_ID]: { [FLAGS.dataJournal]: true, [FLAGS.tags]: emptyTagStore() } },
    });
  }
}
