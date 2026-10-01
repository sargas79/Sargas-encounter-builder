/**
 * Balanced random generation panel: an extension of EncounterBuilderApp.
 * Reads the active party, the catalog filters from the Build tab, and the locked draft entries.
 */
import type { CompositionPreference } from "../core/schemas.js";
import { generateEncounter, type GeneratorInput, type GeneratorResult } from "../core/generator.js";
import { rngFromSeed } from "../core/rng.js";
import { removeEntry, type Draft, type DraftEntry } from "../core/draft.js";
import { t } from "../foundry/i18n.js";
import { services } from "../foundry/services.js";
import { isGM } from "../foundry/compat.js";
import type { EncounterBuilderApp } from "./encounter-builder-app.js";
import { randomHexSeed } from "../core/util.js";

export interface GeneratorOptions {
  relativeMin: number;
  relativeMax: number;
  minCount: number;
  maxCount: number;
  composition: CompositionPreference;
  duplicateCap: number;
  seed: string;
  excludeUuids: string[];
}

const COMPOSITIONS: CompositionPreference[] = ["unrestricted", "solo", "pair", "group", "bossWithSupport"];

export class GeneratorPanel {
  options: GeneratorOptions = {
    relativeMin: -4,
    relativeMax: 4,
    minCount: 1,
    maxCount: 6,
    composition: "unrestricted",
    duplicateCap: 4,
    seed: "",
    excludeUuids: [],
  };
  lastResult: GeneratorResult | null = null;
  lastSeed: string | null = null;
  busy = false;

  constructor(private readonly app: EncounterBuilderApp) {}

  /* ---------------------------- context ----------------------------- */

  async prepareContext(): Promise<Record<string, unknown>> {
    const result = this.lastResult;
    const last = result
      ? result.ok
        ? {
            ok: true,
            fitLabel: t(`generator.fit.${result.fit}`),
            totalXP: result.totalXP,
            target: result.target,
            difference: result.difference,
            feasible: result.feasibleMultisets,
            capped: result.capped,
            explanation: result.explanation.join(" · "),
          }
        : {
            ok: false,
            reason: t(`generator.failure.${result.reason}`, result.detail),
            detail: JSON.stringify(result.detail),
            capped: result.capped,
          }
      : null;
    return {
      options: this.options,
      compositions: COMPOSITIONS.map((value) => ({
        value,
        label: t(`generator.composition.${value}`),
        selected: value === this.options.composition,
      })),
      excluded: this.options.excludeUuids.map((uuid) => ({
        uuid,
        name: services().catalog.get(uuid)?.name ?? uuid,
      })),
      last,
      lastSeed: this.lastSeed,
      busy: this.busy,
      canGenerate: !!this.app.state.evaluation && !this.busy,
      lockedCount: this.app.state.draft.entries.filter((e) => e.locked).length,
    };
  }

  /* ---------------------------- inputs ------------------------------ */

  async onChange(name: string, value: string): Promise<boolean> {
    if (!name.startsWith("gen.")) return false;
    const key = name.slice(4) as keyof GeneratorOptions;
    switch (key) {
      case "composition":
        if (COMPOSITIONS.includes(value as CompositionPreference))
          this.options.composition = value as CompositionPreference;
        break;
      case "seed":
        this.options.seed = value.trim();
        break;
      case "relativeMin":
      case "relativeMax":
      case "minCount":
      case "maxCount":
      case "duplicateCap":
        this.options[key] = Number.parseInt(value, 10) || 0;
        break;
      default:
        return false;
    }
    return true;
  }

  /* ---------------------------- actions ----------------------------- */

  async generate(): Promise<void> {
    await this.#run({});
  }

  async regenerate(): Promise<void> {
    await this.#run({ freshSeed: true });
  }

  /** Re-run with every entry except `uuid` locked, and `uuid` excluded for this run. */
  async replaceEntry(uuid: string): Promise<void> {
    await this.#run({ replaceUuid: uuid });
  }

  /** Exclude from future generation and drop it from the draft (locked or not) so it cannot survive as locked. */
  async exclude(uuid: string): Promise<void> {
    if (!this.options.excludeUuids.includes(uuid)) this.options.excludeUuids.push(uuid);
    if (this.app.state.draft.entries.some((e) => e.uuid === uuid)) {
      this.app.setDraft(removeEntry(this.app.state.draft, uuid));
    }
    await this.app.render({ parts: ["header", "build", "deploy"] });
  }

  async unexclude(uuid: string): Promise<void> {
    this.options.excludeUuids = this.options.excludeUuids.filter((u) => u !== uuid);
    await this.app.render({ parts: ["build"] });
  }

  async #run({
    freshSeed = false,
    replaceUuid,
  }: {
    freshSeed?: boolean;
    replaceUuid?: string;
  }): Promise<void> {
    if (!isGM() || this.busy) return;
    const { catalog } = services();
    const resolved = this.app.state.resolved;
    const roster = resolved?.roster;
    if (!resolved || !roster || roster.blockers.length > 0 || roster.reference.level === null) {
      this.app.pushMessage("warn", t("evaluation.blocked"));
      await this.app.render({ parts: ["header", "build"] });
      return;
    }
    this.busy = true;
    await this.app.render({ parts: ["build"] });
    try {
      const referenceLevel = roster.reference.level;
      const filter = {
        ...this.app.state.filter,
        referenceLevel,
        relativeMin: null,
        relativeMax: null,
        levelMin: null,
        levelMax: null,
        search: "",
      };
      const candidates = await catalog.search(filter);
      const draft = this.app.state.draft;
      const locked = draft.entries
        .filter((e) => (replaceUuid ? e.uuid !== replaceUuid : e.locked))
        .map((e) => ({
          uuid: e.uuid,
          name: e.name,
          level: e.level,
          quantity: e.quantity,
          traits: e.traits,
          img: e.img,
          packLabel: e.packLabel,
        }));
      const seed = this.options.seed || (freshSeed || !this.lastSeed ? randomHexSeed() : this.lastSeed);
      const excludeUuids = [...this.options.excludeUuids, ...(replaceUuid ? [replaceUuid] : [])];
      const input: GeneratorInput = {
        threat: resolved.profile.selectedThreat,
        partySize: roster.partySize,
        referenceLevel,
        candidates: candidates.map((c) => ({
          uuid: c.uuid,
          name: c.name,
          level: c.level,
          traits: c.traits,
          img: c.img,
          packLabel: c.packLabel,
        })),
        relativeMin: this.options.relativeMin,
        relativeMax: this.options.relativeMax,
        minCount: this.options.minCount,
        maxCount: this.options.maxCount,
        composition: this.options.composition,
        duplicateCap: this.options.duplicateCap,
        excludeUuids,
        locked,
        rng: rngFromSeed(seed),
      };
      const result = generateEncounter(input);
      this.lastResult = result;
      this.lastSeed = seed;
      if (result.ok) {
        const previousLocks = new Map(draft.entries.map((e) => [e.uuid, e.locked] as const));
        const entries = mergeEntries(result.entries, previousLocks);
        const newDraft: Draft = {
          entries,
          origin: "generated",
          generation: {
            seed,
            inputs: {
              threat: input.threat,
              partySize: input.partySize,
              referenceLevel,
              relativeMin: input.relativeMin,
              relativeMax: input.relativeMax,
              minCount: input.minCount,
              maxCount: input.maxCount,
              composition: input.composition,
              duplicateCap: input.duplicateCap,
              excludeUuids,
              packIds: catalog.selectedPackIds(),
              traits: this.app.state.filter.traits ?? [],
              tags: this.app.state.filter.tags ?? [],
              rarities: this.app.state.filter.rarities ?? [],
              candidateCount: candidates.length,
            },
          },
        };
        this.app.setDraft(newDraft);
        this.app.pushMessage(
          result.fit === "exact" ? "ok" : "warn",
          t(`generator.resultMessage.${result.fit}`, {
            total: result.totalXP,
            target: result.target,
            difference: result.difference,
          }),
        );
      } else {
        this.app.pushMessage("error", t(`generator.failure.${result.reason}`, result.detail));
      }
    } catch (error) {
      console.error("pf2e-encounter-builder | generation failed", error);
      this.app.pushMessage(
        "error",
        t("errors.generic", { message: error instanceof Error ? error.message : String(error) }),
      );
    } finally {
      this.busy = false;
    }
    await this.app.render({ parts: ["header", "build", "deploy"] });
  }
}

/** Merge generated and locked rows of the same creature into one draft entry (locked wins). */
function mergeEntries(
  entries: {
    uuid: string;
    name: string;
    level: number;
    quantity: number;
    traits: string[];
    img: string | null;
    packLabel: string | null;
  }[],
  previousLocks: Map<string, boolean>,
): DraftEntry[] {
  const map = new Map<string, DraftEntry>();
  for (const e of entries) {
    const existing = map.get(e.uuid);
    if (existing) {
      existing.quantity += e.quantity;
      existing.locked = existing.locked || (previousLocks.get(e.uuid) ?? false);
    } else {
      map.set(e.uuid, {
        uuid: e.uuid,
        name: e.name,
        level: e.level,
        quantity: e.quantity,
        locked: previousLocks.get(e.uuid) ?? false,
        img: e.img,
        packLabel: e.packLabel,
        traits: e.traits,
      });
    }
  }
  return [...map.values()];
}
