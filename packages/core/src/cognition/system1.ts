import type { CognitiveAssessment } from "./assessment.js";
import { assertCognitiveAssessment } from "./assessment.js";
import type { CognitiveWorldState } from "./world-state.js";
import { assertCognitiveWorldState } from "./world-state.js";
import type { AegisObserver, EpistemicObserver, MetisObserver, NikeObserver } from "./observers.js";

export const SYSTEM1_SNAPSHOT_SCHEMA_VERSION = "1";

export interface System1Snapshot {
  readonly worldState: CognitiveWorldState;
  readonly assessment: CognitiveAssessment;
  readonly assessmentSchemaVersion: typeof SYSTEM1_SNAPSHOT_SCHEMA_VERSION;
  readonly observerVersions: { readonly aegis: string; readonly metis: string; readonly nike: string; readonly epistemic: string; };
}

function freezeAssessment(value: CognitiveAssessment): CognitiveAssessment {
  return Object.freeze({
    safety: Object.freeze({ ...value.safety }),
    progress: Object.freeze({ ...value.progress }),
    completion: Object.freeze({ ...value.completion }),
    epistemics: Object.freeze({ ...value.epistemics }),
  });
}

function version(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${label}: expected non-empty string`);
  return value;
}

export function assertSystem1Snapshot(value: unknown): System1Snapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("System1Snapshot: expected object");
  const item = value as Record<string, unknown>;
  const fields = ["worldState", "assessment", "assessmentSchemaVersion", "observerVersions"];
  if (Object.keys(item).some((key) => !fields.includes(key)) || fields.some((key) => !(key in item))) throw new TypeError("System1Snapshot: unexpected or missing field");
  if (item.assessmentSchemaVersion !== SYSTEM1_SNAPSHOT_SCHEMA_VERSION) throw new TypeError("System1Snapshot: invalid assessment schema version");
  if (typeof item.observerVersions !== "object" || item.observerVersions === null || Array.isArray(item.observerVersions)) throw new TypeError("System1Snapshot: invalid observer versions");
  const versions = item.observerVersions as Record<string, unknown>;
  if (Object.keys(versions).some((key) => !["aegis", "metis", "nike", "epistemic"].includes(key)) || ["aegis", "metis", "nike", "epistemic"].some((key) => !(key in versions))) throw new TypeError("System1Snapshot: invalid observer versions");
  return Object.freeze({ worldState: assertCognitiveWorldState(item.worldState), assessment: freezeAssessment(assertCognitiveAssessment(item.assessment)), assessmentSchemaVersion: SYSTEM1_SNAPSHOT_SCHEMA_VERSION, observerVersions: Object.freeze({ aegis: version(versions.aegis, "observerVersions.aegis"), metis: version(versions.metis, "observerVersions.metis"), nike: version(versions.nike, "observerVersions.nike"), epistemic: version(versions.epistemic, "observerVersions.epistemic") }) });
}

export class CognitiveAssessmentEngine {
  constructor(private readonly observers: { readonly aegis: AegisObserver; readonly metis: MetisObserver; readonly nike: NikeObserver; readonly epistemic: EpistemicObserver; }) {}
  async assess(world: CognitiveWorldState): Promise<CognitiveAssessment> {
    const immutableWorld = assertCognitiveWorldState(world);
    const [safety, progress, completion, epistemics] = await Promise.all([this.observers.aegis.assess(immutableWorld), this.observers.metis.assess(immutableWorld), this.observers.nike.assess(immutableWorld), this.observers.epistemic.assess(immutableWorld)]);
    return freezeAssessment(assertCognitiveAssessment({ safety, progress, completion, epistemics }));
  }
  async snapshot(world: CognitiveWorldState): Promise<System1Snapshot> {
    const immutableWorld = assertCognitiveWorldState(world);
    return createSystem1Snapshot(immutableWorld, await this.assess(immutableWorld), { aegis: this.observers.aegis.version, metis: this.observers.metis.version, nike: this.observers.nike.version, epistemic: this.observers.epistemic.version });
  }
}

export function createSystem1Snapshot(worldState: CognitiveWorldState, assessment: CognitiveAssessment, observerVersions: System1Snapshot["observerVersions"]): System1Snapshot {
  return assertSystem1Snapshot({ worldState, assessment, assessmentSchemaVersion: SYSTEM1_SNAPSHOT_SCHEMA_VERSION, observerVersions });
}
