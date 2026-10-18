import { Store, TOOLS, type ToolContext } from "@openfitness/core";
import { describe, expect, it } from "vitest";
import { CASES } from "./cases";

async function query(caseId: string, toolName: string, input: unknown) {
    const testCase = CASES.find((c) => c.id === caseId);
    const tool = TOOLS.find((t) => t.definition.name === toolName);
    if (!testCase || !tool) throw new Error(`Missing ${caseId} or ${toolName}`);
    const store = await Store.open();
    try {
        await store.load(testCase.timeline);
        const context: ToolContext = { store, asOf: testCase.asOf };
        return await tool.run(input, context);
    } finally {
        store.close();
    }
}

describe("case data matches the stated truth", () => {
    it("longest-ride: today's ride is the shortest in the last 30 days", async () => {
        const result = await query("longest-ride", "activity_rank", {
            type: "ride",
            metric: "distance",
            period_days: 30,
        });
        expect(result.fields.latest_value?.value).toBe(16);
        expect(result.holds).toEqual(["shortest"]);
    });

    it("sleep-onset: 20 minutes to fall asleep, deep sleep at 00:25", async () => {
        const result = await query("sleep-onset", "sleep_night", { night_of: null });
        expect(result.fields.minutes_to_fall_asleep?.value).toBe(20);
        expect(result.fields.first_deep_sleep?.value).toBe("00:25");
    });

    it("weight-plateau: steady loss over the last 30 days", async () => {
        const result = await query("weight-plateau", "weight_trend", { period_days: 30 });
        expect(Number(result.fields.change_kg?.value)).toBeLessThan(-8);
        expect(result.holds).toEqual([]);
    });
});
