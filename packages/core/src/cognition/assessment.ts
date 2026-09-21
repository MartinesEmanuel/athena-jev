import type { Probability } from "./validation.js";
import { assertProbability } from "./validation.js";

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
  if (typeof value !== "object" || value === null)
    throw new TypeError("safety: expected object");
  const s = value as Record<string, unknown>;
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
  if (typeof value !== "object" || value === null)
    throw new TypeError("progress: expected object");
  const p = value as Record<string, unknown>;
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
  if (typeof value !== "object" || value === null)
    throw new TypeError("completion: expected object");
  const c = value as Record<string, unknown>;
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
  if (typeof value !== "object" || value === null)
    throw new TypeError("epistemics: expected object");
  const e = value as Record<string, unknown>;
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
  if (typeof value !== "object" || value === null)
    throw new TypeError("CognitiveAssessment: expected object");
  const a = value as Record<string, unknown>;
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
