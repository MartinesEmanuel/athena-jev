import { describe, expect, it } from "vitest";
import { hudAssessmentLabel, hudDecisionLabel, hudEpistemicsLabel, hudStatusLabel, hudSystem2Label, hudTimelineLabel } from "../src/index.js";

describe("HUD presentation labels", () => {
  it("provides visual labels without changing snapshot codes", () => {
    expect(hudStatusLabel.BLOCK).toBe("Blocked");
    expect(hudDecisionLabel.DENY).toBe("Deny");
    expect(hudAssessmentLabel.ALERT).toBe("Alert");
    expect(hudEpistemicsLabel.CONFLICTED).toBe("Conflicted");
    expect(hudSystem2Label.UNAVAILABLE).toBe("Unavailable");
    expect(hudTimelineLabel.SYSTEM2).toBe("System 2");
  });
});
