/**
 * Pure creature catalog model: index entries, filters and search. No Foundry imports.
 * The CreatureCatalog service (src/foundry/creature-catalog.ts) fills this from compendium indexes.
 */

export interface CatalogEntry {
  /** Stable identity: compendium UUID. */
  uuid: string;
  packId: string;
  packLabel: string;
  name: string;
  img: string | null;
  level: number;
  traits: string[];
  rarity: string;
  size: string;
  source: string | null;
  /** GM-maintained tags such as "family:goblinoid", "environment:forest". */
  tags: string[];
}

export interface CatalogFilter {
  search?: string;
  packIds?: string[];
  /** Absolute level bounds. */
  levelMin?: number | null;
  levelMax?: number | null;
  /** Relative level bounds, applied against `referenceLevel` when provided. */
  relativeMin?: number | null;
  relativeMax?: number | null;
  referenceLevel?: number | null;
  /** All listed traits must be present. */
  traits?: string[];
  /** Any listed trait excludes the entry. */
  excludeTraits?: string[];
  rarities?: string[];
  sizes?: string[];
  /** All listed tags must be present (e.g. ["environment:forest"]). */
  tags?: string[];
  excludeUuids?: string[];
}

export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function matchesFilter(entry: CatalogEntry, filter: CatalogFilter): boolean {
  if (filter.packIds && filter.packIds.length > 0 && !filter.packIds.includes(entry.packId)) return false;
  if (filter.excludeUuids?.includes(entry.uuid)) return false;
  if (filter.search) {
    const needle = normalizeSearch(filter.search);
    if (needle && !normalizeSearch(entry.name).includes(needle)) return false;
  }
  if (filter.levelMin != null && entry.level < filter.levelMin) return false;
  if (filter.levelMax != null && entry.level > filter.levelMax) return false;
  if (filter.referenceLevel != null) {
    const rel = entry.level - filter.referenceLevel;
    if (filter.relativeMin != null && rel < filter.relativeMin) return false;
    if (filter.relativeMax != null && rel > filter.relativeMax) return false;
  }
  if (filter.traits && filter.traits.length > 0 && !filter.traits.every((t) => entry.traits.includes(t)))
    return false;
  if (filter.excludeTraits && filter.excludeTraits.some((t) => entry.traits.includes(t))) return false;
  if (filter.rarities && filter.rarities.length > 0 && !filter.rarities.includes(entry.rarity)) return false;
  if (filter.sizes && filter.sizes.length > 0 && !filter.sizes.includes(entry.size)) return false;
  if (filter.tags && filter.tags.length > 0 && !filter.tags.every((t) => entry.tags.includes(t)))
    return false;
  return true;
}

export function filterCatalog(entries: Iterable<CatalogEntry>, filter: CatalogFilter): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const entry of entries) if (matchesFilter(entry, filter)) out.push(entry);
  out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return out;
}

/** Index fields the catalog requests. Verified against PF2e 7.x (docs/VERIFICATION.md §2). */
export const NPC_INDEX_FIELDS = [
  "img",
  "system.details.level.value",
  "system.traits.value",
  "system.traits.rarity",
  "system.traits.size.value",
  "system.details.publication.title",
] as const;

/** Raw index entry shape the adapter hands to `catalogEntryFromIndex`. */
export interface RawIndexEntry {
  _id: string;
  uuid?: string;
  name: string;
  type: string;
  img?: string;
  system?: {
    details?: { level?: { value?: unknown }; publication?: { title?: unknown } };
    traits?: { value?: unknown; rarity?: unknown; size?: { value?: unknown } };
  };
}

/**
 * Convert an index entry into a catalog entry. Returns null for non-NPCs and for entries that lack
 * the level field (the index is incomplete for that pack; the caller reports it instead of guessing).
 */
export function catalogEntryFromIndex(
  raw: RawIndexEntry,
  pack: { id: string; label: string },
  tags: string[] = [],
): CatalogEntry | null {
  if (raw.type !== "npc") return null;
  const level = raw.system?.details?.level?.value;
  if (typeof level !== "number" || !Number.isInteger(level)) return null;
  const traits = raw.system?.traits?.value;
  const rarity = raw.system?.traits?.rarity;
  const size = raw.system?.traits?.size?.value;
  const source = raw.system?.details?.publication?.title;
  return {
    uuid: raw.uuid ?? `Compendium.${pack.id}.Actor.${raw._id}`,
    packId: pack.id,
    packLabel: pack.label,
    name: raw.name,
    img: raw.img ?? null,
    level,
    traits: Array.isArray(traits) ? traits.filter((t): t is string => typeof t === "string") : [],
    rarity: typeof rarity === "string" ? rarity : "common",
    size: typeof size === "string" ? size : "med",
    source: typeof source === "string" && source ? source : null,
    tags,
  };
}

/** Distinct trait list for filter UIs. */
export function collectTraits(entries: Iterable<CatalogEntry>): string[] {
  const set = new Set<string>();
  for (const e of entries) for (const t of e.traits) set.add(t);
  return [...set].sort();
}

/** Parse "family:foo, environment:bar" style tag text into normalized tags. */
export function parseTagText(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[a-z0-9_-]+:[a-z0-9 _-]+$/.test(s)),
    ),
  ];
}
