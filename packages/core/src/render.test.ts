import { describe, expect, it } from "vitest";
import { RenderError, render } from "./render";
import type { QueryResult } from "./result";

const ride: QueryResult = {
    fields: {
        latest_value: { value: 18.4, unit: "km" },
        rank: { value: 5, unit: "count" },
        out_of: { value: 9, unit: "count" },
        top_value: { value: 42.1, unit: "km" },
        top_date: { value: "2026-10-03", unit: "date" },
    },
    addresses: ["longest", "shortest"],
    holds: [],
};

const plateau: QueryResult = {
    fields: { rate: { value: -0.1, unit: "kg_per_week" } },
    addresses: ["plateau"],
    holds: ["plateau"],
};

const results = new Map([
    ["q1", ride],
    ["q2", plateau],
]);

function problemsOf(draft: string): string[] {
    try {
        render(draft, results);
    } catch (error) {
        if (error instanceof RenderError) return error.problems;
        throw error;
    }
    return [];
}

describe("render", () => {
    it("fills placeholders with formatted values", () => {
        expect(render("You rode {{q1.latest_value}}, {{q1.rank}} of {{q1.out_of}}.", results)).toBe(
            "You rode 18.4 km, 5 of 9.",
        );
        expect(render("Longest was on {{q1.top_date}}.", new Map([["q1", { ...ride, holds: ["longest"] }]]))).toBe(
            "Longest was on Sat 3 Oct.",
        );
    });

    it("rejects numbers written directly", () => {
        expect(problemsOf("You rode 18 km today.")).toHaveLength(1);
    });

    it("rejects references to unknown results and fields", () => {
        expect(problemsOf("That took {{q9.latest_value}}.")[0]).toMatch(/no query returned/);
        expect(problemsOf("That took {{q1.speed}}.")[0]).toMatch(/has no field "speed"/);
    });

    it("rejects a comparative claim with no result behind it", () => {
        expect(problemsOf("Great job, that was your longest ride!")[0]).toMatch(/isn't backed/);
    });

    it("rejects a claim the data contradicts", () => {
        expect(problemsOf("At {{q1.latest_value}} that was your longest ride.")[0]).toMatch(/contradicts/);
        expect(problemsOf("You're not in a plateau, your rate is {{q2.rate}}.")[0]).toMatch(/denies "plateau"/);
    });

    it("accepts claims the data supports, including negated ones", () => {
        expect(problemsOf("At {{q1.latest_value}} it wasn’t your longest ride.")).toEqual([]);
        expect(problemsOf("At {{q2.rate}} you're in a plateau.")).toEqual([]);
    });

    it("checks each sentence on its own", () => {
        expect(problemsOf("You rode {{q1.latest_value}}. That was your longest yet.")[0]).toMatch(/isn't backed/);
    });
});
