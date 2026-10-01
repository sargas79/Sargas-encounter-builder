import { describe, expect, it } from "vitest";
import { migratePartyProfileRecord, migrateRecipeRecord } from "../src/foundry/migrations.js";
import { validatePartyProfile, validateRecipe } from "../src/core/schemas.js";

describe("T18 (pure part): migrations stamp versions and preserve data", () => {
  it("migrates a pre-versioned party profile without losing unknown fields", () => {
    const { record, changed } = migratePartyProfileRecord({
      id: "p1",
      name: "Old",
      members: ["Actor.a", "Actor.b"],
      customNote: "keep me",
    });
    expect(changed).toBe(true);
    expect(record.schemaVersion).toBe(1);
    expect(record.customNote).toBe("keep me");
    expect(record.members).toEqual([
      { uuid: "Actor.a", active: true },
      { uuid: "Actor.b", active: true },
    ]);
    expect(validatePartyProfile(record).ok).toBe(true);
  });

  it("is idempotent", () => {
    const first = migratePartyProfileRecord({ id: "p1", name: "Old", members: [] }).record;
    const second = migratePartyProfileRecord(first);
    expect(second.changed).toBe(false);
    expect(second.record).toEqual(first);
  });

  it("migrates a pre-versioned recipe and keeps the entries", () => {
    const { record, changed } = migrateRecipeRecord({
      name: "Ambush",
      entries: [{ uuid: "Compendium.x.y.Actor.z", quantity: 3 }],
      extra: { nested: true },
    });
    expect(changed).toBe(true);
    expect(record.extra).toEqual({ nested: true });
    const validation = validateRecipe(record);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.value.entries[0]).toMatchObject({
        uuid: "Compendium.x.y.Actor.z",
        quantity: 3,
        locked: false,
      });
      expect(validation.value.evaluation).toBeNull();
    }
  });
});
