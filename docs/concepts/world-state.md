# WorldState and CandidateAction

WorldState is the bounded structured context used for assessment: goal, candidate action, current observation, recent actions and strategies, unresolved obligations, and environment constraints. CandidateAction is the proposed tool, answer, or completion step. ATHENA avoids sending an unbounded conversation transcript; bounded state limits exposure and makes each judgment inspectable.
