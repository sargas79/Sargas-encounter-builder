/**
 * EncounterBuilderApp: the GM workspace (ApplicationV2 + Handlebars parts).
 *
 * Tabs: Party, Build (manual / balanced), Tables, Saved, Deploy.
 * All write operations re-check `game.user.isGM`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULE_ID } from "../constants.js";
import { THREAT_LEVELS, type ThreatLevel, type ReferenceLevelPolicy } from "../core/budget.js";
import type { CatalogEntry, CatalogFilter } from "../core/catalog.js";
import {
  addEntry,
  emptyDraft,
  entryFromCatalog,
  evaluateDraft,
  removeEntry,
  setQuantity,
  toggleLock,
  totalCreatures,
  type Draft,
  type DraftEvaluation,
} from "../core/draft.js";
import type { RosterState } from "../core/party.js";
import {
  ApplicationV2,
  DialogV2,
  DragDropClass,
  HandlebarsApplicationMixin,
  debounce,
  getDragEventData,
  isGM,
  loadTemplates,
} from "../foundry/compat.js";
import { t } from "../foundry/i18n.js";
import type { ResolvedParty } from "../foundry/party-service.js";
import { services } from "../foundry/services.js";
import { getSetting } from "../foundry/settings.js";
import { SETTINGS } from "../constants.js";

const TEMPLATES = `modules/${MODULE_ID}/templates/builder`;

type TabId = "party" | "build" | "tables" | "saved" | "deploy";
const TABS: TabId[] = ["party", "build", "tables", "saved", "deploy"];

interface Message {
  level: "info" | "warn" | "error" | "ok";
  text: string;
}

export interface BuilderState {
  resolved: ResolvedParty | null;
  evaluation: DraftEvaluation | null;
  draft: Draft;
  filter: CatalogFilter;
  results: CatalogEntry[];
  busy: boolean;
  messages: Message[];
}

const Base = HandlebarsApplicationMixin()(ApplicationV2()) as any;

export class EncounterBuilderApp extends Base {
  static #instance: EncounterBuilderApp | null = null;

  static DEFAULT_OPTIONS = {
    id: MODULE_ID,
    classes: [MODULE_ID],
    tag: "div",
    window: { title: `${MODULE_ID}.app.title`, icon: "fa-solid fa-dragon", resizable: true },
    position: { width: 1040, height: 760 },
    actions: {
      selectTab: EncounterBuilderApp.#onSelectTab,
      // party
      createProfile: EncounterBuilderApp.#onCreateProfile,
      linkPartyActor: EncounterBuilderApp.#onLinkPartyActor,
      renameProfile: EncounterBuilderApp.#onRenameProfile,
      deleteProfile: EncounterBuilderApp.#onDeleteProfile,
      toggleMember: EncounterBuilderApp.#onToggleMember,
      toggleCounts: EncounterBuilderApp.#onToggleCounts,
      removeMember: EncounterBuilderApp.#onRemoveMember,
      pickMember: EncounterBuilderApp.#onPickMember,
      refreshParty: EncounterBuilderApp.#onRefreshParty,
      // build
      addCreature: EncounterBuilderApp.#onAddCreature,
      inspectCreature: EncounterBuilderApp.#onInspectCreature,
      removeCreature: EncounterBuilderApp.#onRemoveCreature,
      lockCreature: EncounterBuilderApp.#onLockCreature,
      clearDraft: EncounterBuilderApp.#onClearDraft,
      refreshCatalog: EncounterBuilderApp.#onRefreshCatalog,
      editTags: EncounterBuilderApp.#onEditTags,
      togglePack: EncounterBuilderApp.#onTogglePack,
    },
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/header.hbs` },
    tabs: { template: `${TEMPLATES}/tabs.hbs` },
    party: { template: `${TEMPLATES}/party.hbs`, scrollable: [".peb-scroll"] },
    build: { template: `${TEMPLATES}/build.hbs`, scrollable: [".peb-scroll"] },
    tables: { template: `${TEMPLATES}/tables.hbs`, scrollable: [".peb-scroll"] },
    saved: { template: `${TEMPLATES}/saved.hbs`, scrollable: [".peb-scroll"] },
    deploy: { template: `${TEMPLATES}/deploy.hbs`, scrollable: [".peb-scroll"] },
  };

  state: BuilderState = {
    resolved: null,
    evaluation: null,
    draft: emptyDraft(),
    filter: { relativeMin: -4, relativeMax: 4 },
    results: [],
    busy: false,
    messages: [],
  };
  activeTab: TabId = "party";
  #unsubscribe: (() => void)[] = [];
  #listenersAttached = false;
  #search = debounce(() => void this.#runSearch(), 250);
  /** Extension hooks filled by later milestones (generator, tables, saved, deploy). */
  extensions: Record<string, unknown> = {};

  static async open(): Promise<EncounterBuilderApp | null> {
    if (!isGM()) {
      ui.notifications.warn(t("errors.gmOnly"));
      return null;
    }
    await ensurePartials();
    EncounterBuilderApp.#instance ??= new EncounterBuilderApp();
    await EncounterBuilderApp.#instance.render({ force: true });
    return EncounterBuilderApp.#instance;
  }

  static get instance(): EncounterBuilderApp | null {
    return EncounterBuilderApp.#instance;
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  async _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
    await super._onFirstRender?.(context, options);
    const { party, catalog } = services();
    const rerender = debounce(() => void this.refreshParty(), 150);
    this.#unsubscribe.push(
      party.onChange(rerender),
      catalog.onChange(() => void this.render({ parts: ["build"] })),
    );
    await this.refreshParty();
  }

  _onClose(options: Record<string, unknown>): void {
    super._onClose?.(options);
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
    this.#listenersAttached = false;
    EncounterBuilderApp.#instance = null;
  }

  async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
    await super._onRender?.(context, options);
    const root: HTMLElement = this.element;
    if (!this.#listenersAttached) {
      root.addEventListener("change", (event) => void this.#onChange(event));
      root.addEventListener("input", (event) => this.#onInput(event));
      this.#listenersAttached = true;
    }
    // Drag & drop (actors onto party roster / build list).
    const DragDrop = DragDropClass();
    if (DragDrop) {
      new DragDrop({
        dropSelector: ".peb-dropzone",
        permissions: { dragstart: () => false, drop: () => isGM() },
        callbacks: { drop: (event: DragEvent) => void this.#onDrop(event) },
      }).bind(root);
    }
    for (const el of root.querySelectorAll<HTMLElement>(".peb-dropzone")) {
      el.addEventListener("dragenter", () => el.classList.add("dragover"));
      el.addEventListener("dragleave", () => el.classList.remove("dragover"));
      el.addEventListener("drop", () => el.classList.remove("dragover"));
    }
    for (const section of root.querySelectorAll<HTMLElement>("section.tab")) {
      section.classList.toggle("active", section.dataset.tab === this.activeTab);
    }
    for (const a of root.querySelectorAll<HTMLElement>("nav.tabs [data-tab]")) {
      a.classList.toggle("active", a.dataset.tab === this.activeTab);
    }
  }

  /* -------------------------------------------- */
  /*  Data refresh                                */
  /* -------------------------------------------- */

  async refreshParty(): Promise<void> {
    const { party } = services();
    this.state.resolved = await party.resolveActive();
    this.recomputeEvaluation();
    await this.render({ parts: ["header", "party", "build", "deploy"] });
  }

  recomputeEvaluation(): void {
    const resolved = this.state.resolved;
    const roster = resolved?.roster;
    if (!resolved || !roster || roster.blockers.length > 0 || roster.reference.level === null) {
      this.state.evaluation = null;
      return;
    }
    const { adapter } = services();
    const variant = adapter.variantInfo();
    this.state.evaluation = evaluateDraft(this.state.draft, {
      partySize: roster.partySize,
      referenceLevel: roster.reference.level,
      selectedThreat: resolved.profile.selectedThreat,
      pwol: variant.pwol,
      pwolCreatureXP: (ref, lvl) => adapter.pwolCreatureXP(ref, lvl),
    });
    this.#crossCheck();
    Hooks.callAll(`${MODULE_ID}.evaluationChanged`, this.state.evaluation);
  }

  /** Debug-mode cross-check against the PF2e system helper (standard rules, all creatures in range). */
  #crossCheck(): void {
    const evaluation = this.state.evaluation;
    if (
      !evaluation ||
      !getSetting<boolean>(SETTINGS.debugMode) ||
      evaluation.systemCalculation ||
      !evaluation.complete
    )
      return;
    const helper = services().adapter.systemXPHelper();
    if (!helper.available) return;
    const levels = evaluation.entries.flatMap((e) => Array<number>(e.quantity).fill(e.level));
    const systemTotal = helper.total(evaluation.referenceLevel, evaluation.partySize, levels, false);
    if (systemTotal !== null && systemTotal !== evaluation.supportedXP) {
      console.warn(
        `${MODULE_ID} | XP cross-check mismatch: module ${evaluation.supportedXP}, system ${systemTotal}`,
      );
      this.pushMessage(
        "warn",
        t("messages.crossCheckMismatch", { module: evaluation.supportedXP, system: systemTotal }),
      );
    }
  }

  setDraft(draft: Draft, { origin }: { origin?: Draft["origin"] } = {}): void {
    this.state.draft = origin ? { ...draft, origin } : draft;
    this.recomputeEvaluation();
  }

  pushMessage(level: Message["level"], text: string): void {
    this.state.messages = [...this.state.messages.slice(-4), { level, text }];
  }

  async #runSearch(): Promise<void> {
    const { catalog } = services();
    const ref = this.state.resolved?.roster.reference.level ?? null;
    try {
      this.state.results = (await catalog.search({ ...this.state.filter, referenceLevel: ref })).slice(
        0,
        200,
      );
    } catch (error) {
      console.error(`${MODULE_ID} | search failed`, error);
      this.state.results = [];
    }
    await this.render({ parts: ["build"] });
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
    const base = (await super._prepareContext?.(options)) ?? {};
    const { party, catalog, adapter } = services();
    const resolved = this.state.resolved;
    const roster = resolved?.roster ?? null;
    const evaluation = this.state.evaluation;
    const variant = adapter.variantInfo();

    const tabs = TABS.map((id) => ({ id, label: t(`tabs.${id}`), active: id === this.activeTab }));
    const threatOptions = THREAT_LEVELS.map((threat) => {
      const tier = roster ? budgetFor(threat, roster) : null;
      return {
        value: threat,
        label:
          t(`threat.${threat}`) +
          (tier ? ` (${tier.available ? tier.target : t("party.unavailable")} XP)` : ""),
        selected: resolved?.profile.selectedThreat === threat,
        disabled: tier ? !tier.available : false,
      };
    });

    const policies: { value: ReferenceLevelPolicy; label: string; selected: boolean }[] = (
      ["averageFloor", "highest", "lowest", "manual"] as ReferenceLevelPolicy[]
    ).map((value) => ({
      value,
      label: t(`party.policy.${value}`),
      selected: resolved?.profile.referencePolicy === value,
    }));

    const selectedPacks = new Set(catalog.selectedPackIds());
    const packs = catalog.availablePacks().map((p) => ({
      ...p,
      selected: selectedPacks.has(p.id),
      state: catalog.packState(p.id),
      stateLabel: describePackState(catalog.packState(p.id)),
    }));

    return {
      ...base,
      tabs,
      activeTab: this.activeTab,
      isGM: isGM(),
      busy: this.state.busy,
      messages: this.state.messages,
      header: this.#headerContext(resolved, evaluation, variant.pwol),
      party: {
        profiles: party.profiles().map((p) => ({ ...p, selected: p.id === resolved?.profile.id })),
        profile: resolved?.profile ?? null,
        isLinked: resolved?.profile.kind === "linked",
        partyActors: adapter.listPartyActors(),
        roster: roster ? this.#rosterContext(roster) : null,
        policies,
        showPolicy: !!roster && roster.reference.distinctLevels.length > 1,
        manualLevel: resolved?.profile.manualReferenceLevel ?? "",
        isManual: resolved?.profile.referencePolicy === "manual",
        threatOptions,
        blockers: roster?.blockers.map((code) => t(`party.blockers.${code}`)) ?? [],
      },
      build: {
        filter: this.state.filter,
        results: this.state.results.map((entry) => ({
          ...entry,
          relative: roster?.reference.level != null ? entry.level - roster.reference.level : null,
          traitsLabel: entry.traits.join(", "),
          tagsLabel: entry.tags.join(", "),
        })),
        resultCount: this.state.results.length,
        draft: this.state.draft.entries.map((entry) => {
          const ev = evaluation?.entries.find((e) => e.id === entry.uuid);
          return {
            ...entry,
            xpEach: ev?.xpEach ?? null,
            subtotal: ev?.subtotal ?? null,
            status: ev?.status ?? "supported",
            relative: ev?.relativeLevel ?? null,
            statusLabel: ev && ev.status !== "supported" ? t(`evaluation.status.${ev.status}`) : "",
          };
        }),
        draftCount: totalCreatures(this.state.draft),
        evaluation: evaluation ? this.#evaluationContext(evaluation) : null,
        packs,
        missingPacks: catalog.missingSelectedPackIds(),
        noPacks: selectedPacks.size === 0,
        traits: this.state.filter.traits?.join(", ") ?? "",
        tags: this.state.filter.tags?.join(", ") ?? "",
        allTags: services().tags.allTags(),
      },
      ...(await this.#extensionContext()),
    };
  }

  async #extensionContext(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [key, ext] of Object.entries(this.extensions)) {
      const fn = (ext as { prepareContext?: () => Promise<Record<string, unknown>> }).prepareContext;
      if (fn) out[key] = await fn.call(ext);
    }
    return out;
  }

  #headerContext(
    resolved: ResolvedParty | null,
    evaluation: DraftEvaluation | null,
    pwol: boolean,
  ): Record<string, unknown> {
    const roster = resolved?.roster ?? null;
    const ref = roster?.reference;
    return {
      partyName: resolved?.profile.name ?? t("party.none"),
      source: resolved ? t(`party.kind.${resolved.profile.kind}`) : "",
      participating: roster ? roster.partySize : 0,
      levels: roster ? roster.counted.map((m) => m.level).join(", ") || "—" : "—",
      referenceLevel: ref?.level ?? "—",
      policy: ref?.policy ? t(`party.policy.${ref.policy}`) : t("party.policy.none"),
      isEstimate: !!ref?.isEstimate,
      threat: resolved ? t(`threat.${resolved.profile.selectedThreat}`) : "—",
      target: evaluation?.tier
        ? evaluation.tier.available
          ? evaluation.tier.target
          : t("party.unavailable")
        : "—",
      pwol,
      variantUnsupported: evaluation?.variantUnsupported ?? false,
      systemCalculation: evaluation?.systemCalculation ?? false,
    };
  }

  #rosterContext(roster: RosterState): Record<string, unknown> {
    return {
      members: roster.members.map((m) => ({
        ...m,
        statusLabel: t(`party.status.${m.reason}`),
        cssClass:
          m.status === "inactive"
            ? "inactive"
            : m.status === "missing"
              ? "missing"
              : m.status === "notCounted"
                ? "not-counted"
                : "",
        canToggleCounts: m.type === "npc" && m.status !== "missing",
        level: m.level ?? "?",
      })),
      partySize: roster.partySize,
      distinctLevels: roster.reference.distinctLevels.join(", "),
      missingCount: roster.missing.length,
    };
  }

  #evaluationContext(evaluation: DraftEvaluation): Record<string, unknown> {
    const inferred = evaluation.inferred;
    let inferredLabel =
      inferred.label === "beyondExtreme" ? t("evaluation.beyondExtreme") : t(`threat.${inferred.label}`);
    if (inferred.unquantified) inferredLabel += ` ${t("evaluation.unquantified")}`;
    if (inferred.incompleteNegligible) inferredLabel += ` ${t("evaluation.incompleteNegligible")}`;
    return {
      supportedXP: evaluation.supportedXP,
      target: evaluation.tier?.available ? evaluation.tier.target : null,
      difference: evaluation.difference,
      differenceLabel:
        evaluation.difference === null
          ? "—"
          : evaluation.difference > 0
            ? `+${evaluation.difference}`
            : String(evaluation.difference),
      complete: evaluation.complete,
      completeLabel: evaluation.complete ? t("evaluation.complete") : t("evaluation.incomplete"),
      inferredLabel,
      selectedLabel: evaluation.selectedThreat ? t(`threat.${evaluation.selectedThreat}`) : "—",
      creatureCount: evaluation.creatureCount,
      warnings: evaluation.warnings.map((w) => ({
        level: warningLevel(w.code),
        text: t(`evaluation.warnings.${w.code}`, w.data),
      })),
      systemCalculation: evaluation.systemCalculation,
      variantUnsupported: evaluation.variantUnsupported,
    };
  }

  /* -------------------------------------------- */
  /*  Input handling                              */
  /* -------------------------------------------- */

  #onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target?.name === "filter.search") {
      this.state.filter.search = target.value;
      this.#search();
    }
  }

  async #onChange(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (!target?.name || !isGM()) return;
    const { party, catalog } = services();
    const profile = this.state.resolved?.profile;
    const value = target.value;
    switch (target.name) {
      case "activeProfile":
        await party.setActive(value);
        return;
      case "threat":
        if (profile) await party.setThreat(profile.id, value as ThreatLevel);
        return;
      case "referencePolicy":
        if (profile)
          await party.setReferencePolicy(
            profile.id,
            (value || null) as ReferenceLevelPolicy | null,
            profile.manualReferenceLevel,
          );
        return;
      case "manualReferenceLevel":
        if (profile) await party.setReferencePolicy(profile.id, "manual", Number.parseInt(value, 10) || null);
        return;
      case "quantity": {
        const uuid = (target.closest("[data-uuid]") as HTMLElement | null)?.dataset.uuid;
        if (uuid) {
          this.setDraft(setQuantity(this.state.draft, uuid, Number.parseInt(value, 10)));
          await this.render({ parts: ["build", "deploy"] });
        }
        return;
      }
      case "filter.levelMin":
      case "filter.levelMax":
      case "filter.relativeMin":
      case "filter.relativeMax": {
        const key = target.name.slice("filter.".length) as
          "levelMin" | "levelMax" | "relativeMin" | "relativeMax";
        this.state.filter[key] = value === "" ? null : Number.parseInt(value, 10);
        this.#search();
        return;
      }
      case "filter.traits":
        this.state.filter.traits = splitList(value);
        this.#search();
        return;
      case "filter.tags":
        this.state.filter.tags = splitList(value);
        this.#search();
        return;
      case "filter.rarity":
        this.state.filter.rarities = value ? [value] : [];
        this.#search();
        return;
      case "pack": {
        const id = target.dataset.packId;
        if (!id) return;
        const selected = new Set(catalog.selectedPackIds());
        if ((target as HTMLInputElement).checked) selected.add(id);
        else selected.delete(id);
        await catalog.setSelectedPacks([...selected]);
        this.#search();
        return;
      }
      default: {
        for (const ext of Object.values(this.extensions)) {
          const fn = (
            ext as {
              onChange?: (name: string, value: string, target: HTMLElement) => Promise<boolean> | boolean;
            }
          ).onChange;
          if (fn && (await fn.call(ext, target.name, value, target))) return;
        }
      }
    }
  }

  async #onDrop(event: DragEvent): Promise<void> {
    if (!isGM()) return;
    const data = getDragEventData(event);
    const zone = (event.target as HTMLElement).closest<HTMLElement>(".peb-dropzone");
    const purpose = zone?.dataset.purpose;
    if (data?.type !== "Actor" || typeof data.uuid !== "string") {
      if (purpose) this.pushMessage("warn", t("messages.dropNotActor"));
      await this.render({ parts: ["party", "build"] });
      return;
    }
    if (purpose === "party") await this.#addPartyMember(data.uuid);
    else if (purpose === "draft") await this.#addDraftFromUuid(data.uuid);
    else {
      for (const ext of Object.values(this.extensions)) {
        const fn = (
          ext as {
            onDrop?: (
              purpose: string | undefined,
              data: Record<string, unknown>,
            ) => Promise<boolean> | boolean;
          }
        ).onDrop;
        if (fn && (await fn.call(ext, purpose, data))) return;
      }
    }
  }

  async #addPartyMember(uuid: string): Promise<void> {
    const { party } = services();
    const profile = this.state.resolved?.profile;
    if (!profile) {
      this.pushMessage("warn", t("party.noProfile"));
      await this.render({ parts: ["party"] });
      return;
    }
    const result = await party.addMember(profile.id, uuid);
    if (!result.ok) {
      this.pushMessage("warn", t(`party.reject.${result.reason}`));
      await this.render({ parts: ["party"] });
    }
  }

  async #addDraftFromUuid(uuid: string): Promise<void> {
    const { catalog } = services();
    const entry = await catalog.locate(uuid);
    if (entry) {
      this.setDraft(addEntry(this.state.draft, entryFromCatalog(entry)));
    } else {
      // A world NPC or an actor outside any indexed pack: summarize it without importing anything.
      const doc = (await fromUuid(uuid)) as ActorDocument | null;
      if (!doc || doc.type !== "npc" || typeof doc.level !== "number") {
        this.pushMessage("warn", t("messages.dropNotNpc"));
        await this.render({ parts: ["build"] });
        return;
      }
      this.setDraft(
        addEntry(this.state.draft, {
          uuid,
          name: doc.name,
          level: doc.level,
          quantity: 1,
          locked: false,
          img: doc.img ?? null,
          packLabel: doc.pack ?? t("build.worldActor"),
          traits: Array.isArray(doc.system?.traits?.value) ? doc.system.traits.value : [],
        }),
      );
    }
    await this.render({ parts: ["build", "deploy"] });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onSelectTab(this: EncounterBuilderApp, _event: Event, target: HTMLElement): Promise<void> {
    const tab = target.dataset.tab as TabId | undefined;
    if (!tab || !TABS.includes(tab)) return;
    this.activeTab = tab;
    await this.render({ parts: ["tabs", tab] });
  }

  static async #onCreateProfile(this: EncounterBuilderApp): Promise<void> {
    if (!isGM()) return;
    const name = await promptText(
      t("party.newProfileTitle"),
      t("party.newProfileLabel"),
      t("party.defaultName"),
    );
    if (name === null) return;
    await services().party.createProfile(name, "standalone");
  }

  static async #onLinkPartyActor(
    this: EncounterBuilderApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    if (!isGM()) return;
    const select = (this.element as HTMLElement).querySelector<HTMLSelectElement>(
      "select[name='partyActorUuid']",
    );
    const uuid = target.dataset.uuid ?? select?.value;
    if (!uuid) return;
    const actor = services()
      .adapter.listPartyActors()
      .find((p) => p.uuid === uuid);
    await services().party.createProfile(actor?.name ?? t("party.defaultName"), "linked", uuid);
  }

  static async #onRenameProfile(this: EncounterBuilderApp): Promise<void> {
    const profile = this.state.resolved?.profile;
    if (!profile || !isGM()) return;
    const name = await promptText(t("party.renameTitle"), t("party.newProfileLabel"), profile.name);
    if (name !== null) await services().party.renameProfile(profile.id, name);
  }

  static async #onDeleteProfile(this: EncounterBuilderApp): Promise<void> {
    const profile = this.state.resolved?.profile;
    if (!profile || !isGM()) return;
    const ok = await DialogV2().confirm({
      window: { title: t("party.deleteTitle") },
      content: `<p>${t("party.deleteConfirm", { name: profile.name })}</p>`,
    });
    if (ok) await services().party.deleteProfile(profile.id);
  }

  static async #onToggleMember(this: EncounterBuilderApp, _event: Event, target: HTMLElement): Promise<void> {
    const profile = this.state.resolved?.profile;
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
    if (!profile || !uuid || !isGM()) return;
    const member = this.state.resolved?.roster.members.find((m) => m.uuid === uuid);
    await services().party.setMemberActive(profile.id, uuid, !(member?.active ?? true));
  }

  static async #onToggleCounts(this: EncounterBuilderApp, _event: Event, target: HTMLElement): Promise<void> {
    const profile = this.state.resolved?.profile;
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
    if (!profile || !uuid || !isGM()) return;
    const member = this.state.resolved?.roster.members.find((m) => m.uuid === uuid);
    await services().party.setMemberCounts(profile.id, uuid, !(member?.countsAsMember ?? false));
  }

  static async #onRemoveMember(this: EncounterBuilderApp, _event: Event, target: HTMLElement): Promise<void> {
    const profile = this.state.resolved?.profile;
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
    if (!profile || !uuid || !isGM()) return;
    await services().party.removeMember(profile.id, uuid);
  }

  static async #onPickMember(this: EncounterBuilderApp): Promise<void> {
    if (!isGM()) return;
    const candidates = game.actors
      .filter((a) => a.type === "character" || a.type === "npc")
      .map((a) => ({ uuid: a.uuid, name: `${a.name} (${a.type}, ${t("party.level")} ${a.level ?? "?"})` }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const uuid = await promptSelect(t("party.pickTitle"), t("party.pickLabel"), candidates);
    if (uuid) await this.#addPartyMember(uuid);
  }

  static async #onRefreshParty(this: EncounterBuilderApp): Promise<void> {
    services().party.invalidate();
    await this.refreshParty();
  }

  static async #onAddCreature(this: EncounterBuilderApp, _event: Event, target: HTMLElement): Promise<void> {
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;
    const entry = this.state.results.find((e) => e.uuid === uuid) ?? services().catalog.get(uuid);
    if (!entry) return;
    this.setDraft(addEntry(this.state.draft, entryFromCatalog(entry)));
    await this.render({ parts: ["build", "deploy"] });
  }

  static async #onInspectCreature(
    this: EncounterBuilderApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;
    // Explicit full-document load; the sheet is read-only for compendium sources.
    const doc = await services().catalog.loadDocument(uuid);
    if (!doc) {
      this.pushMessage("warn", t("messages.sourceMissing", { uuid }));
      await this.render({ parts: ["build"] });
      return;
    }
    doc.sheet?.render(true);
  }

  static async #onRemoveCreature(
    this: EncounterBuilderApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;
    this.setDraft(removeEntry(this.state.draft, uuid));
    await this.render({ parts: ["build", "deploy"] });
  }

  static async #onLockCreature(this: EncounterBuilderApp, _event: Event, target: HTMLElement): Promise<void> {
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;
    this.setDraft(toggleLock(this.state.draft, uuid));
    await this.render({ parts: ["build"] });
  }

  static async #onClearDraft(this: EncounterBuilderApp): Promise<void> {
    this.setDraft(emptyDraft());
    await this.render({ parts: ["build", "deploy"] });
  }

  static async #onRefreshCatalog(this: EncounterBuilderApp): Promise<void> {
    this.state.busy = true;
    await this.render({ parts: ["build"] });
    try {
      services().tags.invalidate();
      await services().catalog.refresh();
      services().catalog.retag();
    } finally {
      this.state.busy = false;
    }
    await this.#runSearch();
  }

  static async #onTogglePack(this: EncounterBuilderApp, _event: Event, target: HTMLElement): Promise<void> {
    const details = target.closest<HTMLElement>(".peb-packs");
    details?.classList.toggle("collapsed");
  }

  static async #onEditTags(this: EncounterBuilderApp, _event: Event, target: HTMLElement): Promise<void> {
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
    if (!uuid || !isGM()) return;
    const { tags, catalog } = services();
    const current = tags.tagsFor(uuid).join(", ");
    const text = await promptText(t("build.tagsTitle"), t("build.tagsLabel"), current);
    if (text === null) return;
    const { parseTagText } = await import("../core/catalog.js");
    await tags.setTags(uuid, parseTagText(text));
    catalog.retag();
    await this.#runSearch();
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** Partials referenced from the part templates; loaded once. */
export const PARTIALS = [
  `${TEMPLATES}/build-actions.hbs`,
  `${TEMPLATES}/generator.hbs`,
  `${TEMPLATES}/evaluation.hbs`,
];
let partialsLoaded = false;
export async function ensurePartials(): Promise<void> {
  if (partialsLoaded) return;
  await loadTemplates(PARTIALS);
  partialsLoaded = true;
}

function budgetFor(threat: ThreatLevel, roster: RosterState) {
  if (roster.partySize <= 0) return null;
  // Imported lazily to keep this file's imports focused.
  const { tierBudget } = budgetModule;
  return tierBudget(threat, roster.partySize);
}
import * as budgetModule from "../core/budget.js";

function splitList(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function warningLevel(code: string): Message["level"] {
  if (code === "overBudget" || code.startsWith("incomplete") || code === "threatUnavailable") return "warn";
  return "info";
}

function describePackState(
  state: ReturnType<import("../foundry/creature-catalog.js").CreatureCatalog["packState"]>,
): string {
  if (!state) return t("build.packState.notLoaded");
  switch (state.state) {
    case "loaded":
      return t("build.packState.loaded", { count: state.count, skipped: state.skipped });
    case "inaccessible":
      return t("build.packState.inaccessible");
    case "missing":
      return t("build.packState.missing");
    case "error":
      return t("build.packState.error", { message: state.message });
  }
}

export async function promptText(title: string, label: string, initial = ""): Promise<string | null> {
  const result = await DialogV2().prompt({
    window: { title },
    content: `<div class="form-group"><label>${label}</label><input type="text" name="value" value="${escapeAttr(initial)}" autofocus></div>`,
    ok: {
      callback: (_event: Event, button: HTMLButtonElement) =>
        (button.form?.elements.namedItem("value") as HTMLInputElement | null)?.value ?? "",
    },
    rejectClose: false,
  });
  return typeof result === "string" ? result : null;
}

export async function promptSelect(
  title: string,
  label: string,
  options: { uuid: string; name: string }[],
): Promise<string | null> {
  if (options.length === 0) return null;
  const opts = options
    .map((o) => `<option value="${escapeAttr(o.uuid)}">${escapeHtml(o.name)}</option>`)
    .join("");
  const result = await DialogV2().prompt({
    window: { title },
    content: `<div class="form-group"><label>${label}</label><select name="value">${opts}</select></div>`,
    ok: {
      callback: (_event: Event, button: HTMLButtonElement) =>
        (button.form?.elements.namedItem("value") as HTMLSelectElement | null)?.value ?? "",
    },
    rejectClose: false,
  });
  return typeof result === "string" && result ? result : null;
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

export function escapeAttr(text: string): string {
  return escapeHtml(text);
}
