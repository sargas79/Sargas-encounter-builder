/**
 * Thin access layer for Foundry APIs whose location moved between v12/v13/v14.
 * Prefer the namespaced v13+ form and fall back to the legacy global where it still exists.
 * Every function here is a runtime verification point (docs/VERIFICATION.md §4).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const g = globalThis as any;

export function getDragEventData(event: DragEvent): Record<string, any> {
  const impl = g.foundry?.applications?.ux?.TextEditor?.implementation ?? g.TextEditor;
  if (impl?.getDragEventData) return impl.getDragEventData(event);
  try {
    return JSON.parse(event.dataTransfer?.getData("text/plain") ?? "{}");
  } catch {
    return {};
  }
}

export function RollClass(): {
  new (formula: string, data?: Record<string, unknown>): FoundryRoll;
  validate(formula: string): boolean;
} {
  return g.foundry?.dice?.Roll ?? g.Roll;
}

export function documentClass(
  name: "Actor" | "JournalEntry" | "RollTable" | "Folder" | "Combat" | "ChatMessage" | "Item",
): any {
  return g.CONFIG?.[name]?.documentClass ?? g[name];
}

export function renderTemplate(path: string, data: Record<string, unknown>): Promise<string> {
  const fn = g.foundry?.applications?.handlebars?.renderTemplate ?? g.renderTemplate;
  return fn(path, data);
}

export function loadTemplates(paths: string[]): Promise<unknown> {
  const fn = g.foundry?.applications?.handlebars?.loadTemplates ?? g.loadTemplates;
  return fn(paths);
}

export function DialogV2(): typeof foundry.applications.api.DialogV2 {
  return g.foundry.applications.api.DialogV2;
}

export function ApplicationV2(): typeof foundry.applications.api.ApplicationV2 {
  return g.foundry.applications.api.ApplicationV2;
}

export function HandlebarsApplicationMixin(): typeof foundry.applications.api.HandlebarsApplicationMixin {
  return g.foundry.applications.api.HandlebarsApplicationMixin;
}

export function DragDropClass(): any {
  return (
    g.foundry?.applications?.ux?.DragDrop?.implementation ??
    g.foundry?.applications?.ux?.DragDrop ??
    g.DragDrop
  );
}

export function randomID(): string {
  return g.foundry?.utils?.randomID ? g.foundry.utils.randomID() : Math.random().toString(36).slice(2, 18);
}

export function debounce<T extends (...args: any[]) => unknown>(fn: T, delay: number): T {
  if (g.foundry?.utils?.debounce) return g.foundry.utils.debounce(fn, delay);
  let handle: ReturnType<typeof setTimeout> | undefined;
  return ((...args: unknown[]) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function ownershipLevels(): { NONE: number; OWNER: number } {
  return g.CONST?.DOCUMENT_OWNERSHIP_LEVELS ?? { NONE: 0, OWNER: 3 };
}

export function gridTypes(): { GRIDLESS: number; SQUARE: number } {
  return g.CONST?.GRID_TYPES ?? { GRIDLESS: 0, SQUARE: 1 };
}

export function isGM(): boolean {
  return !!g.game?.user?.isGM;
}
