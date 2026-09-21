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

export class CognitiveAssessmentEngine {
  constructor(private readonly observers: { readonly aegis: AegisObserver; readonly metis: MetisObserver; readonly nike: NikeObserver; readonly epistemic: EpistemicObserver; }) {}
  async assess(world: CognitiveWorldState): Promise<CognitiveAssessment> {
    const [safety, progress, completion, epistemics] = await Promise.all([this.observers.aegis.assess(world), this.observers.metis.assess(world), this.observers.nike.assess(world), this.observers.epistemic.assess(world)]);
    return freezeAssessment(assertCognitiveAssessment({ safety, progress, completion, epistemics }));
  }
  async snapshot(world: CognitiveWorldState): Promise<System1Snapshot> {
    return createSystem1Snapshot(world, await this.assess(world), { aegis: this.observers.aegis.version, metis: this.observers.metis.version, nike: this.observers.nike.version, epistemic: this.observers.epistemic.version });
  }
}

export function createSystem1Snapshot(worldState: CognitiveWorldState, assessment: CognitiveAssessment, observerVersions: System1Snapshot["observerVersions"]): System1Snapshot {
  return Object.freeze({ worldState: assertCognitiveWorldState(worldState), assessment: freezeAssessment(assertCognitiveAssessment(assessment)), assessmentSchemaVersion: SYSTEM1_SNAPSHOT_SCHEMA_VERSION, observerVersions: Object.freeze({ aegis: observerVersions.aegis, metis: observerVersions.metis, nike: observerVersions.nike, epistemic: observerVersions.epistemic }) });
}
