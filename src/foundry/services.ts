/**
 * Lazily constructed singletons wiring the services to Foundry. Hooks are registered once.
 */
import { CreatureCatalog, FoundryPackProvider } from "./creature-catalog.js";
import { PartyService, SettingsProfileStore } from "./party-service.js";
import { PF2eAdapter } from "./pf2e-adapter.js";
import { TagStoreService } from "./tag-store.js";
import { ThemeStoreService } from "./theme-store.js";
import { randomID } from "./compat.js";

export interface Services {
  adapter: PF2eAdapter;
  party: PartyService;
  catalog: CreatureCatalog;
  tags: TagStoreService;
  themes: ThemeStoreService;
}

let instance: Services | null = null;

export function services(): Services {
  if (instance) return instance;
  const adapter = new PF2eAdapter();
  const tags = new TagStoreService();
  const themes = new ThemeStoreService();
  const party = new PartyService(adapter, new SettingsProfileStore(), randomID);
  const catalog = new CreatureCatalog(new FoundryPackProvider(), tags);
  party.registerHooks();
  catalog.registerHooks();
  instance = { adapter, party, catalog, tags, themes };
  return instance;
}
