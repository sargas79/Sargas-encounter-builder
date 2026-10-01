/**
 * Pure party roster logic. Given resolved actor summaries, compute who counts, the reference level,
 * and the problems the GM must see. No Foundry imports; the PartyService feeds this from adapters.
 */
import {
  resolveReferenceLevel,
  validatePartyInputs,
  type PartyValidationError,
  type ReferenceLevelResolution,
} from "./budget.js";
import type { PartyProfile } from "./schemas.js";

/** What the adapter knows about one actor UUID. */
export interface ActorSummary {
  uuid: string;
  name: string;
  /** PF2e actor type: character, npc, familiar, animal companion (type "character"? no: "familiar"/"npc"), party, hazard, ... */
  type: string;
  level: number | null;
  /** Whether the current user can read it. */
  accessible: boolean;
  /** PF2e-specific: companions are "character"-like but flagged by the adapter. */
  isCompanionLike?: boolean;
}

export type MemberStatus =
  "counted" | "inactive" | "notCounted" | "overrideCounted" | "missing" | "unsupported";

export interface RosterMember {
  uuid: string;
  name: string;
  type: string;
  level: number | null;
  active: boolean;
  status: MemberStatus;
  /** Localization key fragment explaining the status. */
  reason: string;
  countsAsMember: boolean;
}

export interface RosterState {
  members: RosterMember[];
  counted: RosterMember[];
  partySize: number;
  reference: ReferenceLevelResolution;
  errors: PartyValidationError[];
  /** Blocking problems the GM must resolve before evaluation/generation (as reason codes). */
  blockers: string[];
  missing: RosterMember[];
}

export const SUPPORTED_MEMBER_TYPES = ["character"] as const;
export const OVERRIDABLE_MEMBER_TYPES = ["npc"] as const;

/** Decide whether an actor type can be added to a standalone profile at all. */
export function membershipRejectionReason(type: string): string | null {
  if (type === "character" || type === "npc") return null;
  if (type === "party") return "rejectParty";
  if (type === "familiar") return "rejectFamiliar";
  if (type === "hazard") return "rejectHazard";
  return "rejectUnsupported";
}

export function buildRoster(
  profile: PartyProfile,
  summaries: Map<string, ActorSummary>,
  /** For linked profiles: the member UUIDs read live from the Party actor. */
  partyActorMemberUuids: string[] | null = null,
): RosterState {
  const overrideByUuid = new Map(profile.members.map((m) => [m.uuid, m]));
  const uuids =
    profile.kind === "linked" && partyActorMemberUuids
      ? partyActorMemberUuids
      : profile.members.map((m) => m.uuid);

  const members: RosterMember[] = [];
  for (const uuid of uuids) {
    const override = overrideByUuid.get(uuid);
    const active = override?.active ?? true;
    const countsAsMember = override?.countsAsMember ?? false;
    const summary = summaries.get(uuid);

    if (!summary || !summary.accessible) {
      members.push({
        uuid,
        name: summary?.name ?? uuid,
        type: summary?.type ?? "unknown",
        level: null,
        active,
        status: "missing",
        reason: "missing",
        countsAsMember,
      });
      continue;
    }

    const base = {
      uuid,
      name: summary.name,
      type: summary.type,
      level: summary.level,
      active,
      countsAsMember,
    };
    if (summary.type === "character" && !summary.isCompanionLike) {
      if (!active) members.push({ ...base, status: "inactive", reason: "inactive" });
      else if (summary.level === null) members.push({ ...base, status: "unsupported", reason: "noLevel" });
      else members.push({ ...base, status: "counted", reason: "counted" });
    } else if (summary.type === "npc") {
      if (countsAsMember && active && summary.level !== null)
        members.push({ ...base, status: "overrideCounted", reason: "npcOverride" });
      else if (!active) members.push({ ...base, status: "inactive", reason: "inactive" });
      else members.push({ ...base, status: "notCounted", reason: "npcNotCounted" });
    } else if (summary.type === "familiar" || summary.isCompanionLike) {
      members.push({ ...base, status: "notCounted", reason: "companionNotCounted" });
    } else {
      members.push({
        ...base,
        status: "unsupported",
        reason: membershipRejectionReason(summary.type) ?? "rejectUnsupported",
      });
    }
  }

  const counted = members.filter((m) => m.status === "counted" || m.status === "overrideCounted");
  const partySize = counted.length;
  const levels = counted.map((m) => m.level).filter((l): l is number => l !== null);
  const reference = resolveReferenceLevel(levels, profile.referencePolicy, profile.manualReferenceLevel);
  const errors = validatePartyInputs(partySize, reference.level);
  const missing = members.filter((m) => m.status === "missing");

  const blockers: string[] = [];
  if (partySize === 0) blockers.push("noActiveCharacters");
  if (reference.requiresChoice) blockers.push("mixedLevelsNeedPolicy");
  if (!reference.requiresChoice && partySize > 0 && reference.level === null)
    blockers.push("referenceLevelUnresolved");
  if (reference.level !== null && errors.some((e) => e.code === "referenceLevelInvalid"))
    blockers.push("referenceLevelInvalid");

  return { members, counted, partySize, reference, errors, blockers, missing };
}

/** Add a member to a standalone profile, rejecting duplicates and unsupported types. */
export function addMemberToProfile(
  profile: PartyProfile,
  summary: ActorSummary,
): { ok: true; profile: PartyProfile } | { ok: false; reason: string } {
  if (profile.kind !== "standalone") return { ok: false, reason: "linkedProfileReadOnly" };
  if (profile.members.some((m) => m.uuid === summary.uuid)) return { ok: false, reason: "duplicateMember" };
  const rejection = membershipRejectionReason(summary.type);
  if (rejection) return { ok: false, reason: rejection };
  return {
    ok: true,
    profile: { ...profile, members: [...profile.members, { uuid: summary.uuid, active: true }] },
  };
}

export function setMemberActive(profile: PartyProfile, uuid: string, active: boolean): PartyProfile {
  const existing = profile.members.find((m) => m.uuid === uuid);
  const members = existing
    ? profile.members.map((m) => (m.uuid === uuid ? { ...m, active } : m))
    : [...profile.members, { uuid, active }];
  return { ...profile, members };
}

export function setMemberCountsAsMember(
  profile: PartyProfile,
  uuid: string,
  countsAsMember: boolean,
): PartyProfile {
  const existing = profile.members.find((m) => m.uuid === uuid);
  const members = existing
    ? profile.members.map((m) => (m.uuid === uuid ? { ...m, countsAsMember } : m))
    : [...profile.members, { uuid, active: true, countsAsMember }];
  return { ...profile, members };
}

export function removeMember(profile: PartyProfile, uuid: string): PartyProfile {
  return { ...profile, members: profile.members.filter((m) => m.uuid !== uuid) };
}

export function newProfile(
  id: string,
  name: string,
  kind: PartyProfile["kind"],
  partyActorUuid?: string,
): PartyProfile {
  return {
    schemaVersion: 1,
    id,
    name,
    kind,
    partyActorUuid,
    members: [],
    referencePolicy: null,
    manualReferenceLevel: null,
    selectedThreat: "moderate",
  };
}
