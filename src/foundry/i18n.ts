import { MODULE_ID } from "../constants.js";

/** Localize a module key (`pf2e-encounter-builder.<key>`). Falls back to the key when missing. */
export function t(key: string, data?: Record<string, unknown>): string {
  const full = key.startsWith(`${MODULE_ID}.`) ? key : `${MODULE_ID}.${key}`;
  if (typeof game === "undefined" || !game.i18n) return full;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/** Notify through the Foundry UI, with console fallback for headless contexts. */
export const notify = {
  info(key: string, data?: Record<string, unknown>): void {
    ui?.notifications?.info(t(key, data));
  },
  warn(key: string, data?: Record<string, unknown>): void {
    ui?.notifications?.warn(t(key, data));
  },
  error(key: string, data?: Record<string, unknown>, error?: unknown): void {
    ui?.notifications?.error(t(key, data));
    if (error) console.error(`${MODULE_ID} |`, error);
  },
};

export function log(...args: unknown[]): void {
  console.debug(`${MODULE_ID} |`, ...args);
}
