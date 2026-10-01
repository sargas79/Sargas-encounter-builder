/**
 * ItemCatalog: index-only view of Item compendiums for treasure generation. Reads price, level,
 * rarity, traits and type from the compendium index; never loads full documents while browsing.
 */
import type { TreasureCandidate, TreasureKind } from "../core/treasure.js";

export interface RawItemIndexEntry {
  _id: string;
  uuid?: string;
  name: string;
  type?: string;
  img?: string;
  system?: {
    level?: { value?: number };
    price?: { value?: { pp?: number; gp?: number; sp?: number; cp?: number }; per?: number };
    traits?: { rarity?: string; value?: string[] };
    stackGroup?: string | null;
    quantity?: number;
  };
}

export interface ItemPackProvider {
  /** Item packs this catalog may read, in priority order. */
  listItemPacks(): { id: string; label: string; packageName: string }[];
  getIndex(packId: string, fields: readonly string[]): Promise<RawItemIndexEntry[]>;
}

export const ITEM_INDEX_FIELDS = [
  "type",
  "img",
  "system.level.value",
  "system.price.value",
  "system.price.per",
  "system.traits.rarity",
  "system.traits.value",
  "system.stackGroup",
] as const;

/** PF2e's equipment compendium; other Item packs are ignored unless selected explicitly. */
export const DEFAULT_ITEM_PACKS = ["pf2e.equipment-srd"];

const PERMANENT_TYPES = new Set(["weapon", "armor", "shield", "equipment", "backpack"]);

export interface CoinItems {
  pp: string | null;
  gp: string | null;
  sp: string | null;
  cp: string | null;
}

export class FoundryItemPackProvider implements ItemPackProvider {
  listItemPacks(): { id: string; label: string; packageName: string }[] {
    return game.packs
      .filter((p) => p.documentName === "Item" || p.metadata.type === "Item")
      .map((p) => ({ id: p.collection, label: p.metadata.label, packageName: p.metadata.packageName }));
  }

  async getIndex(packId: string, fields: readonly string[]): Promise<RawItemIndexEntry[]> {
    const pack = game.packs.get(packId);
    if (!pack) throw new Error(`Pack ${packId} not found`);
    const index = await pack.getIndex({ fields: [...fields] });
    return index.contents.map((e) => ({
      ...(e as unknown as RawItemIndexEntry),
      uuid: (e as { uuid?: string }).uuid ?? `Compendium.${packId}.Item.${e._id}`,
    }));
  }
}

export class ItemCatalog {
  #entries: TreasureCandidate[] | null = null;
  #byUuid = new Map<string, TreasureCandidate>();
  #coins: CoinItems | null = null;
  #loading: Promise<void> | null = null;
  packIds: string[];

  constructor(
    private readonly provider: ItemPackProvider,
    packIds: string[] = DEFAULT_ITEM_PACKS,
  ) {
    this.packIds = packIds;
  }

  /** Packs that exist in this world among the configured ids. */
  availablePackIds(): string[] {
    const available = new Set(this.provider.listItemPacks().map((p) => p.id));
    return this.packIds.filter((id) => available.has(id));
  }

  invalidate(): void {
    this.#entries = null;
    this.#byUuid.clear();
    this.#coins = null;
  }

  async ensureLoaded(): Promise<void> {
    if (this.#entries) return;
    if (this.#loading) return this.#loading;
    this.#loading = (async () => {
      const entries: TreasureCandidate[] = [];
      const coins: CoinItems = { pp: null, gp: null, sp: null, cp: null };
      for (const packId of this.availablePackIds()) {
        const raw = await this.provider.getIndex(packId, ITEM_INDEX_FIELDS);
        for (const entry of raw) {
          const candidate = toCandidate(entry, packId);
          if (candidate) entries.push(candidate);
          const coin = coinKey(entry);
          if (coin && !coins[coin]) coins[coin] = entry.uuid ?? `Compendium.${packId}.Item.${entry._id}`;
        }
      }
      this.#entries = entries;
      this.#byUuid = new Map(entries.map((e) => [e.uuid, e]));
      this.#coins = coins;
    })().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }

  candidates(): TreasureCandidate[] {
    return this.#entries ?? [];
  }

  get(uuid: string): TreasureCandidate | undefined {
    return this.#byUuid.get(uuid);
  }

  /** Compendium UUIDs of the system's coin items, when found. */
  coinItems(): CoinItems {
    return this.#coins ?? { pp: null, gp: null, sp: null, cp: null };
  }

  categories(): string[] {
    return [...new Set((this.#entries ?? []).map((e) => e.category))].sort();
  }
}

/* -------------------------------------------- */
/*  Mapping                                     */
/* -------------------------------------------- */

export function priceInGp(price: NonNullable<RawItemIndexEntry["system"]>["price"]): number {
  const v = price?.value ?? {};
  const gp = (v.pp ?? 0) * 10 + (v.gp ?? 0) + (v.sp ?? 0) / 10 + (v.cp ?? 0) / 100;
  const per = price?.per && price.per > 0 ? price.per : 1;
  return Math.round((gp / per) * 100) / 100;
}

export function kindForType(
  type: string | undefined,
  stackGroup: string | null | undefined,
): TreasureKind | null {
  if (type === "consumable") return "consumable";
  if (type === "treasure") return stackGroup === "coins" ? null : "valuable";
  if (type && PERMANENT_TYPES.has(type)) return "permanent";
  return null;
}

export function toCandidate(entry: RawItemIndexEntry, packId: string): TreasureCandidate | null {
  const kind = kindForType(entry.type, entry.system?.stackGroup ?? null);
  if (!kind) return null;
  const price = priceInGp(entry.system?.price);
  if (!(price > 0)) return null;
  const level = Number(entry.system?.level?.value ?? 0);
  return {
    uuid: entry.uuid ?? `Compendium.${packId}.Item.${entry._id}`,
    name: entry.name,
    level: Number.isFinite(level) ? level : 0,
    price,
    rarity: entry.system?.traits?.rarity ?? "common",
    kind,
    category: entry.type ?? "equipment",
    traits: entry.system?.traits?.value ?? [],
    img: entry.img ?? null,
  };
}

function coinKey(entry: RawItemIndexEntry): keyof CoinItems | null {
  if (entry.type !== "treasure" || entry.system?.stackGroup !== "coins") return null;
  const name = entry.name.toLowerCase();
  if (name.startsWith("platinum")) return "pp";
  if (name.startsWith("gold")) return "gp";
  if (name.startsWith("silver")) return "sp";
  if (name.startsWith("copper")) return "cp";
  return null;
}
