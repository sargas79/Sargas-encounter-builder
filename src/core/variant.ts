/**
 * Balanced variants of classic table results: diff the original outcome against the variant.
 */
import type { RecipeEntry, VariantDiffEntry } from "./schemas.js";

export function diffEntries(original: RecipeEntry[], variant: RecipeEntry[]): VariantDiffEntry[] {
  const diff: VariantDiffEntry[] = [];
  const byUuid = new Map(variant.map((e) => [e.uuid, e]));
  for (const o of original) {
    const v = byUuid.get(o.uuid);
    if (!v) diff.push({ uuid: o.uuid, name: o.name, change: "removed", from: o.quantity, to: 0 });
    else if (v.quantity !== o.quantity)
      diff.push({ uuid: o.uuid, name: o.name, change: "quantityChanged", from: o.quantity, to: v.quantity });
    byUuid.delete(o.uuid);
  }
  for (const v of byUuid.values())
    diff.push({ uuid: v.uuid, name: v.name, change: "added", from: 0, to: v.quantity });
  return diff;
}
