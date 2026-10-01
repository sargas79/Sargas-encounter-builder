/**
 * Pure deployment planning and operation bookkeeping. The DeploymentService executes a plan
 * through a `DeploymentGateway` (Foundry) and this module tracks what was created so partial
 * failures can be reported exactly and cleaned up safely.
 */
import type { DraftEntry } from "./draft.js";

export type ImportPolicy = "reuse" | "fresh";

export interface DeploymentOptions {
  sceneId: string;
  importPolicy: ImportPolicy;
  hidden: boolean;
  addToCombat: "none" | "active" | "new";
  numberDuplicates: boolean;
}

export interface PlannedActor {
  sourceUuid: string;
  name: string;
  quantity: number;
  /** World actor to reuse (uuid) or null to import fresh. Resolved by the service before execution. */
  reuseActorUuid: string | null;
}

export interface DeploymentPlan {
  options: DeploymentOptions;
  actors: PlannedActor[];
  totalTokens: number;
}

export function planDeployment(
  entries: DraftEntry[],
  options: DeploymentOptions,
  reuse: (sourceUuid: string) => string | null,
): DeploymentPlan {
  const actors: PlannedActor[] = entries
    .filter((e) => e.quantity > 0)
    .map((e) => ({
      sourceUuid: e.uuid,
      name: e.name,
      quantity: e.quantity,
      reuseActorUuid: options.importPolicy === "reuse" ? reuse(e.uuid) : null,
    }));
  return { options, actors, totalTokens: actors.reduce((n, a) => n + a.quantity, 0) };
}

/* -------------------------------------------- */
/*  Operation ledger                            */
/* -------------------------------------------- */

export interface CreatedRecord {
  kind: "Actor" | "Token" | "Combat" | "Combatant";
  id: string;
  uuid: string;
  name: string;
}

export interface OperationFailure {
  stage: "import" | "place" | "combat";
  subject: string;
  message: string;
}

export class OperationLedger {
  readonly created: CreatedRecord[] = [];
  readonly reused: { kind: "Actor" | "Combat"; uuid: string; name: string }[] = [];
  readonly failures: OperationFailure[] = [];
  readonly id: string;
  #finished = false;

  constructor(id: string) {
    this.id = id;
  }

  record(record: CreatedRecord): void {
    this.created.push(record);
  }

  reuse(record: { kind: "Actor" | "Combat"; uuid: string; name: string }): void {
    this.reused.push(record);
  }

  fail(failure: OperationFailure): void {
    this.failures.push(failure);
  }

  finish(): void {
    this.#finished = true;
  }

  get finished(): boolean {
    return this.#finished;
  }

  get partial(): boolean {
    return this.failures.length > 0;
  }

  /** Documents that are safe to delete: only what this operation created. Never reused or pre-existing. */
  cleanupTargets(): CreatedRecord[] {
    // Delete in dependency order: combatants, tokens, combats, then actors.
    const order: CreatedRecord["kind"][] = ["Combatant", "Token", "Combat", "Actor"];
    return [...this.created].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  }

  summary(): { created: Record<CreatedRecord["kind"], number>; reused: number; failures: number } {
    const created = { Actor: 0, Token: 0, Combat: 0, Combatant: 0 };
    for (const c of this.created) created[c.kind]++;
    return { created, reused: this.reused.length, failures: this.failures.length };
  }
}
