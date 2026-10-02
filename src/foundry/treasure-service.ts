/**
 * Treasure outputs: a Loot actor in the module folder, items added to an existing actor, or a
 * GM-only chat card. Every path re-checks `game.user.isGM` and never touches player-owned documents
 * except the actor the GM explicitly targets.
 */
import { DOCUMENT_NAMES, FLAGS, MODULE_ID } from "../constants.js";
import { escapeHtml } from "../core/util.js";
import { formatCoins, formatGp as gp, type Coins, type TreasureResult } from "../core/treasure.js";
import { documentClass, ownershipLevels } from "./compat.js";
import type { CoinItems } from "./item-catalog.js";

export interface TreasureOutputOptions {
  name: string;
  coinItems: CoinItems;
}

export class TreasureService {
  /** Create a Loot actor holding every item and the coins. Returns the actor. */
  async createLootActor(result: TreasureResult, options: TreasureOutputOptions): Promise<ActorDocument> {
    this.#assertGM();
    const items = await this.#itemData(result, options.coinItems);
    const folder = await this.#ensureFolder();
    const levels = ownershipLevels();
    const ActorClass = documentClass("Actor");
    const actor: ActorDocument = await ActorClass.create({
      name: options.name,
      type: "loot",
      img: "icons/containers/chest/chest-reinforced-steel-brown.webp",
      folder: folder?.id ?? null,
      ownership: { default: levels.NONE },
      system: { lootSheetType: "Loot" },
      items,
      flags: {
        [MODULE_ID]: {
          [FLAGS.treasure]: { seed: result.seed, totalValue: result.budget.totalValue, at: Date.now() },
        },
      },
    });
    if (!actor) throw new Error("Loot actor creation failed");
    return actor;
  }

  /** Add every item and the coins to an existing actor the GM points at. */
  async addToActor(result: TreasureResult, actor: ActorDocument, coinItems: CoinItems): Promise<number> {
    this.#assertGM();
    const items = await this.#itemData(result, coinItems);
    if (items.length === 0) return 0;
    const created = await actor.createEmbeddedDocuments("Item", items);
    return created.length;
  }

  /** Whisper a summary card to every GM. */
  async postToChat(result: TreasureResult, title: string): Promise<void> {
    this.#assertGM();
    const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
    const ChatMessageClass = documentClass("ChatMessage");
    await ChatMessageClass.create({
      content: treasureCardHtml(result, title),
      whisper: gmIds,
      speaker: ChatMessageClass.getSpeaker?.({ alias: "Encounter Builder" }) ?? {
        alias: "Encounter Builder",
      },
      flags: { [MODULE_ID]: { [FLAGS.treasure]: { seed: result.seed } } },
    });
  }

  async #itemData(result: TreasureResult, coinItems: CoinItems): Promise<Record<string, unknown>[]> {
    const wanted: { uuid: string; quantity: number | null }[] = result.entries.map((e) => ({
      uuid: e.uuid,
      quantity: null,
    }));
    for (const [key, quantity] of Object.entries(result.coins) as [keyof Coins, number][]) {
      if (quantity <= 0) continue;
      const uuid = coinItems[key];
      if (!uuid) {
        console.warn(
          `${MODULE_ID} | no ${key} coin item in the equipment compendium; ${quantity} ${key} skipped`,
        );
        continue;
      }
      wanted.push({ uuid, quantity });
    }
    const sources = await Promise.all(wanted.map((w) => fromUuid(w.uuid)));
    const out: Record<string, unknown>[] = [];
    sources.forEach((source, i) => {
      const { uuid, quantity } = wanted[i]!;
      if (!source) {
        console.warn(`${MODULE_ID} | treasure item ${uuid} not found; skipped`);
        return;
      }
      const data = source.toObject();
      delete data._id;
      delete data.folder;
      data._stats = { ...(data._stats ?? {}), compendiumSource: uuid };
      if (quantity !== null) data.system = { ...(data.system ?? {}), quantity };
      out.push(data);
    });
    return out;
  }

  async #ensureFolder(): Promise<FolderDocument | null> {
    const existing = game.folders.find((f) => f.type === "Actor" && f.name === DOCUMENT_NAMES.lootFolder);
    if (existing) return existing;
    try {
      return await documentClass("Folder").create({ name: DOCUMENT_NAMES.lootFolder, type: "Actor" });
    } catch (error) {
      console.warn(`${MODULE_ID} | could not create the treasure folder`, error);
      return null;
    }
  }

  #assertGM(): void {
    if (!game.user.isGM) throw new Error("GM only");
  }
}

export function treasureCardHtml(result: TreasureResult, title: string): string {
  const rows = result.entries
    .map(
      (e) =>
        `<li>@UUID[${e.uuid}]{${escapeHtml(e.name)}} <span style="opacity:.7">(level ${e.level}, ${formatGp(e.price)})</span></li>`,
    )
    .join("");
  const b = result.budget;
  return [
    `<div class="seb-chat-card"><h3>${escapeHtml(title)}</h3>`,
    `<p style="opacity:.8">Level ${b.level}, party of ${b.partySize}, ${Math.round(b.share * 100)}% of a level: ${formatGp(b.totalValue)} budget.</p>`,
    rows ? `<ul>${rows}</ul>` : "<p><em>No items.</em></p>",
    `<p><strong>Coins:</strong> ${escapeHtml(formatCoins(result.coins))}</p>`,
    `<p style="opacity:.7">Items ${formatGp(result.itemsValue)} · currency ${formatGp(result.currencyValue)}</p></div>`,
  ].join("");
}

function formatGp(value: number): string {
  return `${gp(value)} gp`;
}
