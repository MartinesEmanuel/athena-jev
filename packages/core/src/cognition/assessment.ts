import type { Probability } from "./validation.js";
import { assertProbability } from "./validation.js";

function assertExactObject(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label}: expected object`);
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !fields.includes(key)) || fields.some((key) => !(key in item))) throw new TypeError(`${label}: unexpected or missing dimensions`);
  return item;
}

export interface SafetyAssessment {
  failureProbability: Probability;
  impactSeverity: Probability;
  irreversibility: Probability;
  policyViolationProbability: Probability;
}

export interface ProgressAssessment {
  progressProbability: Probability;
  informationGainProbability: Probability;
  strategyNovelty: Probability;
  stagnationProbability: Probability;
  goalAlignment: Probability;
}

export interface CompletionAssessment {
  goalSatisfiedProbability: Probability;
  evidenceCoverage: Probability;
  unresolvedObligationsProbability: Probability;
}

export interface EpistemicAssessment {
  stateUncertainty: Probability;
  contextSufficiency: Probability;
  contradictionProbability: Probability;
}

export type EpistemicsAssessment = EpistemicAssessment;

export interface CognitiveAssessment {
  safety: SafetyAssessment;
  progress: ProgressAssessment;
  completion: CompletionAssessment;
  epistemics: EpistemicAssessment;
}

function assertSafety(value: unknown): SafetyAssessment {
  const s = assertExactObject(value, "safety", ["failureProbability", "impactSeverity", "irreversibility", "policyViolationProbability"]);
  return {
    failureProbability: assertProbability(s.failureProbability, "safety.failureProbability"),
    impactSeverity: assertProbability(s.impactSeverity, "safety.impactSeverity"),
    irreversibility: assertProbability(s.irreversibility, "safety.irreversibility"),
    policyViolationProbability: assertProbability(
      s.policyViolationProbability,
      "safety.policyViolationProbability",
    ),
  };
}

function assertProgress(value: unknown): ProgressAssessment {
  const p = assertExactObject(value, "progress", ["progressProbability", "informationGainProbability", "strategyNovelty", "stagnationProbability", "goalAlignment"]);
  return {
    progressProbability: assertProbability(p.progressProbability, "progress.progressProbability"),
    informationGainProbability: assertProbability(
      p.informationGainProbability,
      "progress.informationGainProbability",
    ),
    strategyNovelty: assertProbability(p.strategyNovelty, "progress.strategyNovelty"),
    stagnationProbability: assertProbability(p.stagnationProbability, "progress.stagnationProbability"),
    goalAlignment: assertProbability(p.goalAlignment, "progress.goalAlignment"),
  };
}

function assertCompletion(value: unknown): CompletionAssessment {
  const c = assertExactObject(value, "completion", ["goalSatisfiedProbability", "evidenceCoverage", "unresolvedObligationsProbability"]);
  return {
    goalSatisfiedProbability: assertProbability(
      c.goalSatisfiedProbability,
      "completion.goalSatisfiedProbability",
    ),
    evidenceCoverage: assertProbability(c.evidenceCoverage, "completion.evidenceCoverage"),
    unresolvedObligationsProbability: assertProbability(
      c.unresolvedObligationsProbability,
      "completion.unresolvedObligationsProbability",
    ),
  };
}

function assertEpistemics(value: unknown): EpistemicAssessment {
  const e = assertExactObject(value, "epistemics", ["stateUncertainty", "contextSufficiency", "contradictionProbability"]);
  return {
    stateUncertainty: assertProbability(e.stateUncertainty, "epistemics.stateUncertainty"),
    contextSufficiency: assertProbability(e.contextSufficiency, "epistemics.contextSufficiency"),
    contradictionProbability: assertProbability(
      e.contradictionProbability,
      "epistemics.contradictionProbability",
    ),
  };
}

export function assertCognitiveAssessment(value: unknown): CognitiveAssessment {
  const a = assertExactObject(value, "CognitiveAssessment", ["safety", "progress", "completion", "epistemics"]);
  return {
    safety: assertSafety(a.safety),
    progress: assertProgress(a.progress),
    completion: assertCompletion(a.completion),
    epistemics: assertEpistemics(a.epistemics),
  };
}

export function isValidCognitiveAssessment(
  value: unknown,
): value is CognitiveAssessment {
  try {
    assertCognitiveAssessment(value);
    return true;
  } catch {
    return false;
  }
}
