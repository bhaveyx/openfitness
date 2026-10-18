import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Store } from "./store";
import { NoDataError, TOOLS, type ToolContext } from "./tools";

const asOf = "2026-10-17";
let context: ToolContext;

function tool(name: string) {
    const found = TOOLS.find((t) => t.definition.name === name);
    if (!found) throw new Error(`No tool ${name}`);
    return found;
}

beforeAll(async () => {
    const store = await Store.open();
    await store.load({
        activities: [
            { id: "a1", type: "ride", start: "2026-10-03T08:00:00", durationMin: 120, distanceKm: 42.1 },
            { id: "a2", type: "ride", start: "2026-10-10T08:00:00", durationMin: 60, distanceKm: 21.5 },
            { id: "a3", type: "ride", start: "2026-10-17T07:30:00", durationMin: 45, distanceKm: 15.2 },
            { id: "a4", type: "ride", start: "2026-08-01T08:00:00", durationMin: 300, distanceKm: 99 },
            { id: "a5", type: "run", start: "2026-10-16T07:00:00", durationMin: 30, distanceKm: 5 },
        ],
        sleep: [
            {
                nightOf: "2026-10-17",
                inBed: "2026-10-16T23:10:00",
                asleep: "2026-10-16T23:30:00",
                firstDeep: "2026-10-17T00:25:00",
                wake: "2026-10-17T07:00:00",
            },
        ],
        weight: [
            { date: "2026-09-20", kg: 90 },
            { date: "2026-10-04", kg: 88 },
            { date: "2026-10-17", kg: 86 },
        ],
    });
    context = { store, asOf };
});

afterAll(() => context.store.close());

describe("activity_rank", () => {
    it("ranks the latest activity within the period only", async () => {
        const result = await tool("activity_rank").run({ type: "ride", metric: "distance", period_days: 30 }, context);
        expect(result.fields.latest_value?.value).toBe(15.2);
        expect(result.fields.rank?.value).toBe(3);
        expect(result.fields.out_of?.value).toBe(3);
        expect(result.fields.top_value?.value).toBe(42.1);
        expect(result.holds).toEqual(["shortest"]);
    });

    it("reports when there is nothing to rank", async () => {
        await expect(
            tool("activity_rank").run({ type: "walk", metric: "distance", period_days: 30 }, context),
        ).rejects.toBeInstanceOf(NoDataError);
    });
});

describe("sleep_night", () => {
    it("measures across midnight", async () => {
        const result = await tool("sleep_night").run({ night_of: null }, context);
        expect(result.fields.minutes_to_fall_asleep?.value).toBe(20);
        expect(result.fields.minutes_asleep_to_deep?.value).toBe(55);
        expect(result.fields.first_deep_sleep?.value).toBe("00:25");
        expect(result.fields.time_asleep?.value).toBe(450);
    });
});

describe("weight_trend", () => {
    it("fits a weekly rate and does not call steady loss a plateau", async () => {
        const result = await tool("weight_trend").run({ period_days: 30 }, context);
        expect(result.fields.change_kg?.value).toBe(-4);
        expect(Number(result.fields.rate?.value)).toBeCloseTo(-1.04, 1);
        expect(result.holds).toEqual([]);
    });
});
