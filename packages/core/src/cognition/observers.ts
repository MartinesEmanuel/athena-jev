import type { CognitiveAssessment, CompletionAssessment, EpistemicsAssessment, ProgressAssessment, SafetyAssessment } from "./assessment.js";
import { assertCognitiveAssessment } from "./assessment.js";
import type { CognitiveWorldState } from "./world-state.js";

export const AEGIS_OBSERVER_VERSION = "1";
export const METIS_OBSERVER_VERSION = "1";
export const NIKE_OBSERVER_VERSION = "1";
export const EPISTEMIC_OBSERVER_VERSION = "1";

export interface ProbabilisticJudge<Input, Output> { judge(input: Input): Promise<Output>; }
export interface CognitiveObserver<Assessment> { readonly name: string; readonly version: string; assess(world: CognitiveWorldState): Promise<Assessment>; }

export class CognitiveObserverError extends Error {
  readonly causeCategory: "judge_failure";
  constructor(readonly observerName: string, readonly observerVersion: string) {
    super(`${observerName}@${observerVersion}: judge failed`);
    this.name = "CognitiveObserverError";
    this.causeCategory = "judge_failure";
  }
}

export class InvalidObserverAssessmentError extends Error {
  readonly causeCategory: "invalid_assessment";
  constructor(readonly observerName: string, readonly observerVersion: string) {
    super(`${observerName}@${observerVersion}: invalid assessment`);
    this.name = "InvalidObserverAssessmentError";
    this.causeCategory = "invalid_assessment";
  }
}

export interface AegisJudgmentInput { readonly candidate: CognitiveWorldState["candidate"]; readonly currentObservation: CognitiveWorldState["currentObservation"]; readonly environment: CognitiveWorldState["environment"]; readonly recentFailures: readonly CognitiveWorldState["recentActions"][number][]; }
export interface MetisJudgmentInput { readonly goal: CognitiveWorldState["goal"]; readonly candidate: CognitiveWorldState["candidate"]; readonly currentObservation: CognitiveWorldState["currentObservation"]; readonly recentActions: CognitiveWorldState["recentActions"]; readonly recentStrategies: CognitiveWorldState["recentStrategies"]; }
export interface NikeJudgmentInput { readonly goal: CognitiveWorldState["goal"]; readonly candidate: CognitiveWorldState["candidate"]; readonly currentObservation: CognitiveWorldState["currentObservation"]; readonly recentActions: CognitiveWorldState["recentActions"]; readonly obligations: CognitiveWorldState["unresolvedObligations"]; }
export interface EpistemicJudgmentInput { readonly goal: CognitiveWorldState["goal"]; readonly candidate: CognitiveWorldState["candidate"]; readonly currentObservation: CognitiveWorldState["currentObservation"]; readonly recentActions: CognitiveWorldState["recentActions"]; readonly recentStrategies: CognitiveWorldState["recentStrategies"]; readonly obligations: CognitiveWorldState["unresolvedObligations"]; }

function frozen<T extends object>(value: T): T { return Object.freeze(value); }

abstract class JudgeObserver<Input, Assessment> implements CognitiveObserver<Assessment> {
  abstract readonly name: string;
  abstract readonly version: string;
  constructor(private readonly probabilisticJudge: ProbabilisticJudge<Input, Assessment>) {}
  protected abstract input(world: CognitiveWorldState): Input;
  protected abstract validate(value: unknown): Assessment;
  async assess(world: CognitiveWorldState): Promise<Assessment> {
    let value: Assessment;
    try { value = await this.probabilisticJudge.judge(this.input(world)); }
    catch { throw new CognitiveObserverError(this.name, this.version); }
    try { return frozen(this.validate(value) as object) as Assessment; }
    catch { throw new InvalidObserverAssessmentError(this.name, this.version); }
  }
}

export class AegisObserver extends JudgeObserver<AegisJudgmentInput, SafetyAssessment> {
  readonly name = "AEGIS";
  readonly version = AEGIS_OBSERVER_VERSION;
  protected input(world: CognitiveWorldState): AegisJudgmentInput { return frozen({ candidate: world.candidate, currentObservation: world.currentObservation, environment: world.environment, recentFailures: Object.freeze(world.recentActions.filter((action) => action.outcome === "FAILURE")) }); }
  protected validate(value: unknown): SafetyAssessment { return assertCognitiveAssessment({ safety: value, progress: zeros.progress, completion: zeros.completion, epistemics: zeros.epistemics }).safety; }
}

export class MetisObserver extends JudgeObserver<MetisJudgmentInput, ProgressAssessment> {
  readonly name = "METIS";
  readonly version = METIS_OBSERVER_VERSION;
  protected input(world: CognitiveWorldState): MetisJudgmentInput { return frozen({ goal: world.goal, candidate: world.candidate, currentObservation: world.currentObservation, recentActions: world.recentActions, recentStrategies: world.recentStrategies }); }
  protected validate(value: unknown): ProgressAssessment { return assertCognitiveAssessment({ safety: zeros.safety, progress: value, completion: zeros.completion, epistemics: zeros.epistemics }).progress; }
}

export class NikeObserver extends JudgeObserver<NikeJudgmentInput, CompletionAssessment> {
  readonly name = "NIKE";
  readonly version = NIKE_OBSERVER_VERSION;
  protected input(world: CognitiveWorldState): NikeJudgmentInput { return frozen({ goal: world.goal, candidate: world.candidate, currentObservation: world.currentObservation, recentActions: world.recentActions, obligations: world.unresolvedObligations }); }
  protected validate(value: unknown): CompletionAssessment { return assertCognitiveAssessment({ safety: zeros.safety, progress: zeros.progress, completion: value, epistemics: zeros.epistemics }).completion; }
}

export class EpistemicObserver extends JudgeObserver<EpistemicJudgmentInput, EpistemicsAssessment> {
  readonly name = "EPISTEMICS";
  readonly version = EPISTEMIC_OBSERVER_VERSION;
  protected input(world: CognitiveWorldState): EpistemicJudgmentInput { return frozen({ goal: world.goal, candidate: world.candidate, currentObservation: world.currentObservation, recentActions: world.recentActions, recentStrategies: world.recentStrategies, obligations: world.unresolvedObligations }); }
  protected validate(value: unknown): EpistemicsAssessment { return assertCognitiveAssessment({ safety: zeros.safety, progress: zeros.progress, completion: zeros.completion, epistemics: value }).epistemics; }
}

const zeros: CognitiveAssessment = {
  safety: { failureProbability: 0 as SafetyAssessment["failureProbability"], impactSeverity: 0 as SafetyAssessment["impactSeverity"], irreversibility: 0 as SafetyAssessment["irreversibility"], policyViolationProbability: 0 as SafetyAssessment["policyViolationProbability"] },
  progress: { progressProbability: 0 as ProgressAssessment["progressProbability"], informationGainProbability: 0 as ProgressAssessment["informationGainProbability"], strategyNovelty: 0 as ProgressAssessment["strategyNovelty"], stagnationProbability: 0 as ProgressAssessment["stagnationProbability"], goalAlignment: 0 as ProgressAssessment["goalAlignment"] },
  completion: { goalSatisfiedProbability: 0 as CompletionAssessment["goalSatisfiedProbability"], evidenceCoverage: 0 as CompletionAssessment["evidenceCoverage"], unresolvedObligationsProbability: 0 as CompletionAssessment["unresolvedObligationsProbability"] },
  epistemics: { stateUncertainty: 0 as EpistemicsAssessment["stateUncertainty"], contextSufficiency: 0 as EpistemicsAssessment["contextSufficiency"], contradictionProbability: 0 as EpistemicsAssessment["contradictionProbability"] },
};
