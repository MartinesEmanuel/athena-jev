import type { CognitiveAssessment } from "./assessment.js";
import type { Decision } from "./decision.js";

export interface CognitiveState {
  readonly step: number;
  readonly lastDecision: Decision | undefined;
  readonly consecutiveLowProgress: number;
  readonly consecutiveLowInformationGain: number;
  readonly consecutiveHighStagnation: number;
  readonly actionsSinceLastDeliberation: number;
  readonly deliberationsUsed: number;
  readonly verificationsUsed: number;
  readonly blocks: number;
  readonly awaitingStrategyShift: boolean;
  readonly recentAssessments: readonly CognitiveAssessment[];
}

export function initialCognitiveState(): CognitiveState {
  return {
    step: 0,
    lastDecision: undefined,
    consecutiveLowProgress: 0,
    consecutiveLowInformationGain: 0,
    consecutiveHighStagnation: 0,
    actionsSinceLastDeliberation: 0,
    deliberationsUsed: 0,
    verificationsUsed: 0,
    blocks: 0,
    awaitingStrategyShift: false,
    recentAssessments: [],
  };
}
