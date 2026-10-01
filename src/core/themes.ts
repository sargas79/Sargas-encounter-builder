/**
 * Creature themes: coherent pools derived from PF2e traits and GM tags, plus GM-authored themes.
 *
 * A theme is "what these creatures have in common": a creature type (undead, fey, …), an optional
 * sub-theme trait (goblin, ghoul, …) or GM family tag, and/or an environment tag. Themes are derived
 * automatically from the catalog in use, so no creature data is bundled. Pure; no Foundry imports.
 */

/** PF2e creature-type traits (Remaster). Used as the primary theme axis. */
export const CREATURE_TYPE_TRAITS: readonly string[] = [
  "aberration",
  "animal",
  "astral",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "dream",
  "elemental",
  "ethereal",
  "fey",
  "fiend",
  "fungus",
  "giant",
  "humanoid",
  "monitor",
  "ooze",
  "petitioner",
  "plant",
  "shade",
  "spirit",
  "time",
  "undead",
  "vitality",
  "void",
];

/**
 * Descriptor traits that say nothing about family or theme. Anything else that co-occurs on several
 * creatures of a type is treated as a sub-theme (ancestry, family, or kind).
 */
export const DESCRIPTOR_TRAITS: ReadonlySet<string> = new Set([
  "mindless",
  "incorporeal",
  "amphibious",
  "aquatic",
  "swarm",
  "minion",
  "evil",
  "good",
  "lawful",
  "chaotic",
  "holy",
  "unholy",
  "common",
  "uncommon",
  "rare",
  "unique",
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
  "air",
  "earth",
  "fire",
  "water",
  "wood",
  "metal",
  "cold",
  "acid",
  "electricity",
  "sonic",
  "poison",
  "mental",
  "force",
  "light",
  "darkness",
  "shadow",
  "negative",
  "positive",
  "magical",
  "divine",
  "arcane",
  "occult",
  "primal",
  "troop",
  "mutant",
  "mythic",
  "skeleton",
  "zombie",
  "ghost",
  "golem",
]);

import type { CustomThemeRecord } from "./schemas.js";

export interface ThemeCandidate {
  uuid: string;
  name: string;
  level: number;
  traits: string[];
  tags?: string[];
  img?: string | null;
  packLabel?: string | null;
}

export interface Theme {
  /** Stable id: "auto:undead", "auto:humanoid/goblin", "env:forest", "custom:<id>". */
  id: string;
  name: string;
  kind: "auto" | "environment" | "custom" | "locked";
  /** Creature-type trait, or null for environment/custom themes without one. */
  primaryTrait: string | null;
  /** Sub-theme trait or GM "family:" tag value. */
  subTrait: string | null;
  /** GM "environment:" tag (without the prefix). */
  environment: string | null;
  /** Custom themes: all of these traits are required. */
  requiredTraits: string[];
  /** Custom themes: explicit creature UUIDs always included. */
  candidateUuids: string[];
  notes: string;
}

export type CustomTheme = CustomThemeRecord;

/* -------------------------------------------- */
/*  Membership                                  */
/* -------------------------------------------- */

export function primaryTraitOf(candidate: ThemeCandidate): string | null {
  for (const trait of candidate.traits) if (CREATURE_TYPE_TRAITS.includes(trait)) return trait;
  return null;
}

export function subTraitsOf(candidate: ThemeCandidate): string[] {
  const out: string[] = [];
  for (const trait of candidate.traits) {
    if (CREATURE_TYPE_TRAITS.includes(trait) || DESCRIPTOR_TRAITS.has(trait)) continue;
    out.push(trait);
  }
  for (const tag of candidate.tags ?? []) if (tag.startsWith("family:")) out.push(tag);
  return out;
}

export function environmentsOf(candidate: ThemeCandidate): string[] {
  return (candidate.tags ?? [])
    .filter((t) => t.startsWith("environment:"))
    .map((t) => t.slice("environment:".length));
}

export function matchesTheme(
  candidate: ThemeCandidate,
  theme: Theme,
  customs?: Map<string, CustomTheme>,
): boolean {
  if (theme.kind === "custom") {
    const custom = customs?.get(theme.id.replace(/^custom:/, ""));
    if (custom) {
      if (custom.candidateUuids.includes(candidate.uuid)) return true;
      if (custom.requiredTraits.length === 0 && custom.anyTraits.length === 0 && !custom.environment)
        return false;
      if (
        !custom.requiredTraits.every(
          (t) => candidate.traits.includes(t) || (candidate.tags ?? []).includes(t),
        )
      )
        return false;
      if (
        custom.anyTraits.length > 0 &&
        !custom.anyTraits.some((t) => candidate.traits.includes(t) || (candidate.tags ?? []).includes(t))
      )
        return false;
      if (custom.environment && !environmentsOf(candidate).includes(custom.environment)) return false;
      return true;
    }
  }
  if (theme.candidateUuids.includes(candidate.uuid)) return true;
  if (
    theme.primaryTrait &&
    primaryTraitOf(candidate) !== theme.primaryTrait &&
    !candidate.traits.includes(theme.primaryTrait)
  )
    return false;
  if (theme.subTrait && !subTraitsOf(candidate).includes(theme.subTrait)) return false;
  if (theme.environment && !environmentsOf(candidate).includes(theme.environment)) return false;
  if (theme.requiredTraits.length > 0 && !theme.requiredTraits.every((t) => candidate.traits.includes(t)))
    return false;
  return true;
}

export function themePool<T extends ThemeCandidate>(
  theme: Theme,
  candidates: T[],
  customs?: Map<string, CustomTheme>,
): T[] {
  return candidates.filter((c) => matchesTheme(c, theme, customs));
}

/* -------------------------------------------- */
/*  Derivation                                  */
/* -------------------------------------------- */

export interface DerivedTheme extends Theme {
  /** Members in the catalog it was derived from. */
  size: number;
  minLevel: number;
  maxLevel: number;
}

export interface DeriveOptions {
  /** Minimum members for a type theme. */
  minTypeMembers?: number;
  /** Minimum members for a sub-theme. */
  minSubMembers?: number;
}

/** Derive auto themes (by creature type, by type+sub-theme, by environment tag) from a candidate set. */
export function deriveThemes(candidates: ThemeCandidate[], options: DeriveOptions = {}): DerivedTheme[] {
  const minType = options.minTypeMembers ?? 2;
  const minSub = options.minSubMembers ?? 3;
  const byType = new Map<string, ThemeCandidate[]>();
  const bySub = new Map<string, ThemeCandidate[]>();
  const byEnv = new Map<string, ThemeCandidate[]>();
  for (const c of candidates) {
    const type = primaryTraitOf(c);
    if (type) {
      push(byType, type, c);
      for (const sub of subTraitsOf(c)) push(bySub, `${type}/${sub}`, c);
    }
    for (const env of environmentsOf(c)) push(byEnv, env, c);
  }
  const themes: DerivedTheme[] = [];
  for (const [type, members] of byType) {
    if (members.length < minType) continue;
    themes.push(
      finish(
        {
          id: `auto:${type}`,
          name: titleCase(type),
          kind: "auto",
          primaryTrait: type,
          subTrait: null,
          environment: null,
          requiredTraits: [],
          candidateUuids: [],
          notes: "",
        },
        members,
      ),
    );
  }
  for (const [key, members] of bySub) {
    if (members.length < minSub) continue;
    const [type, sub] = key.split("/") as [string, string];
    const subLabel = sub.startsWith("family:") ? sub.slice("family:".length) : sub;
    themes.push(
      finish(
        {
          id: `auto:${key}`,
          name: `${titleCase(type)} · ${titleCase(subLabel)}`,
          kind: "auto",
          primaryTrait: type,
          subTrait: sub,
          environment: null,
          requiredTraits: [],
          candidateUuids: [],
          notes: "",
        },
        members,
      ),
    );
  }
  for (const [env, members] of byEnv) {
    if (members.length < minType) continue;
    themes.push(
      finish(
        {
          id: `env:${env}`,
          name: `${titleCase(env)} (environment)`,
          kind: "environment",
          primaryTrait: null,
          subTrait: null,
          environment: env,
          requiredTraits: [],
          candidateUuids: [],
          notes: "",
        },
        members,
      ),
    );
  }
  return themes.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
}

export function customToTheme(custom: CustomTheme): Theme {
  return {
    id: `custom:${custom.id}`,
    name: custom.name,
    kind: "custom",
    primaryTrait: null,
    subTrait: null,
    environment: custom.environment,
    requiredTraits: custom.requiredTraits,
    candidateUuids: custom.candidateUuids,
    notes: custom.notes,
  };
}

/**
 * Infer a theme from locked creatures: the creature type they share, narrowed to a shared sub-theme
 * when one exists. Null when they share nothing.
 */
export function inferThemeFromLocked(locked: ThemeCandidate[]): Theme | null {
  if (locked.length === 0) return null;
  const types = locked.map(primaryTraitOf);
  const type = types[0];
  if (!type || types.some((t) => t !== type)) {
    // No shared type: fall back to any trait shared by all locked creatures.
    const shared = locked[0]!.traits.filter(
      (t) => !DESCRIPTOR_TRAITS.has(t) && locked.every((c) => c.traits.includes(t)),
    );
    const trait = shared[0];
    return trait
      ? {
          id: `locked:${trait}`,
          name: titleCase(trait),
          kind: "locked",
          primaryTrait: null,
          subTrait: null,
          environment: null,
          requiredTraits: [trait],
          candidateUuids: [],
          notes: "",
        }
      : null;
  }
  const subs = subTraitsOf(locked[0]!).filter((s) => locked.every((c) => subTraitsOf(c).includes(s)));
  const sub = subs[0] ?? null;
  const subLabel = sub?.startsWith("family:") ? sub.slice("family:".length) : sub;
  return {
    id: sub ? `locked:${type}/${sub}` : `locked:${type}`,
    name: sub ? `${titleCase(type)} · ${titleCase(subLabel!)}` : titleCase(type),
    kind: "locked",
    primaryTrait: type,
    subTrait: sub,
    environment: null,
    requiredTraits: [],
    candidateUuids: [],
    notes: "",
  };
}

/* -------------------------------------------- */

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function finish(theme: Theme, members: ThemeCandidate[]): DerivedTheme {
  const levels = members.map((m) => m.level);
  return { ...theme, size: members.length, minLevel: Math.min(...levels), maxLevel: Math.max(...levels) };
}

export function titleCase(text: string): string {
  return text.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
