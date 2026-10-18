import type Anthropic from "@anthropic-ai/sdk";
import type { Claim, QueryResult } from "./result";
import type { Store } from "./store";
import type { ActivityType } from "./timeline";

/** Raised when a query has nothing to answer with; the coach reports it to the model as a tool error. */
export class NoDataError extends Error {}

export interface ToolContext {
    store: Store;
    /** The local date questions are asked on, `YYYY-MM-DD`. Periods end on this day. */
    asOf: string;
}

export interface QueryTool<Input> {
    definition: Anthropic.Tool;
    run(input: Input, context: ToolContext): Promise<QueryResult>;
}

/**
 * Below this rate, week-to-week weight change is within normal day-to-day water and food
 * variation, so it reads as a plateau rather than loss or gain.
 */
const PLATEAU_KG_PER_WEEK = 0.25;

const activityRank: QueryTool<{ type: ActivityType; metric: "distance" | "duration"; period_days: number }> = {
    definition: {
        name: "activity_rank",
        description:
            "Ranks the most recent activity of a type against all activities of that type in the period ending today. " +
            "Use it for any question about whether an activity was the longest, shortest, or how it compares.",
        strict: true,
        input_schema: {
            type: "object",
            properties: {
                type: { type: "string", enum: ["ride", "run", "walk", "strength"] },
                metric: { type: "string", enum: ["distance", "duration"] },
                period_days: { type: "integer", description: "Days to look back, including today." },
            },
            required: ["type", "metric", "period_days"],
            additionalProperties: false,
        },
    },
    async run({ type, metric, period_days }, { store, asOf }) {
        const rows = await store.rows<{ day: string; value: number; rank: number; total: number }>(
            `SELECT strftime(start_at, '%Y-%m-%d') AS day,
                    value::DOUBLE AS value,
                    (rank() OVER (ORDER BY value DESC))::INTEGER AS rank,
                    (count(*) OVER ())::INTEGER AS total
             FROM (
                 SELECT start_at, CASE WHEN $metric = 'distance' THEN distance_km ELSE duration_min END AS value
                 FROM activities
                 WHERE type = $type AND start_at >= $from::TIMESTAMP AND start_at < $until::TIMESTAMP
             )
             WHERE value IS NOT NULL
             ORDER BY start_at DESC`,
            { type, metric, from: daysBefore(asOf, period_days - 1), until: daysBefore(asOf, -1) },
        );
        const latest = rows[0];
        if (!latest) throw new NoDataError(`No ${type} activities with a ${metric} in the last ${period_days} days.`);
        const top = rows.reduce((best, row) => (row.value > best.value ? row : best));
        const unit = metric === "distance" ? "km" : "min";
        const holds: Claim[] = [];
        if (latest.rank === 1) holds.push("longest");
        if (latest.total > 1 && latest.rank === latest.total) holds.push("shortest");
        return {
            fields: {
                latest_value: { value: latest.value, unit },
                latest_date: { value: latest.day, unit: "date" },
                rank: { value: latest.rank, unit: "count" },
                out_of: { value: latest.total, unit: "count" },
                top_value: { value: top.value, unit },
                top_date: { value: top.day, unit: "date" },
            },
            addresses: ["longest", "shortest"],
            holds,
        };
    },
};

const sleepNight: QueryTool<{ night_of: string | null }> = {
    definition: {
        name: "sleep_night",
        description:
            "Times for one night of sleep: when the user got into bed, fell asleep, first reached deep sleep and woke up. " +
            "Nights are filed under the date they end on; pass null for last night.",
        strict: true,
        input_schema: {
            type: "object",
            properties: {
                night_of: { type: ["string", "null"], description: "YYYY-MM-DD, or null for last night." },
            },
            required: ["night_of"],
            additionalProperties: false,
        },
    },
    async run({ night_of }, { store, asOf }) {
        const night = night_of ?? asOf;
        const [row] = await store.rows<{
            in_bed: string;
            asleep: string;
            first_deep: string | null;
            wake: string;
            to_sleep: number;
            to_deep: number | null;
            slept: number;
        }>(
            `SELECT strftime(in_bed_at, '%H:%M') AS in_bed,
                    strftime(asleep_at, '%H:%M') AS asleep,
                    strftime(first_deep_at, '%H:%M') AS first_deep,
                    strftime(wake_at, '%H:%M') AS wake,
                    date_diff('minute', in_bed_at, asleep_at)::INTEGER AS to_sleep,
                    date_diff('minute', asleep_at, first_deep_at)::INTEGER AS to_deep,
                    date_diff('minute', asleep_at, wake_at)::INTEGER AS slept
             FROM sleep_nights WHERE night_of = $night::DATE`,
            { night },
        );
        if (!row) throw new NoDataError(`No sleep recorded for the night of ${night}.`);
        return {
            fields: {
                night_of: { value: night, unit: "date" },
                in_bed: { value: row.in_bed, unit: "time" },
                asleep: { value: row.asleep, unit: "time" },
                minutes_to_fall_asleep: { value: row.to_sleep, unit: "min" },
                ...(row.first_deep !== null && row.to_deep !== null
                    ? {
                          first_deep_sleep: { value: row.first_deep, unit: "time" as const },
                          minutes_asleep_to_deep: { value: row.to_deep, unit: "min" as const },
                      }
                    : {}),
                woke: { value: row.wake, unit: "time" },
                time_asleep: { value: row.slept, unit: "min" },
            },
            addresses: [],
            holds: [],
        };
    },
};

const weightTrend: QueryTool<{ period_days: number }> = {
    definition: {
        name: "weight_trend",
        description:
            "Weight change over the period ending today: first and latest weigh-in, total change and the fitted weekly rate. " +
            "Use it for any question about progress, loss, gain or a plateau.",
        strict: true,
        input_schema: {
            type: "object",
            properties: {
                period_days: { type: "integer", description: "Days to look back, including today." },
            },
            required: ["period_days"],
            additionalProperties: false,
        },
    },
    async run({ period_days }, { store, asOf }) {
        const [row] = await store.rows<{
            entries: number;
            first_kg: number | null;
            latest_kg: number | null;
            per_day: number | null;
        }>(
            `SELECT count(*)::INTEGER AS entries,
                    arg_min(kg, measured_on)::DOUBLE AS first_kg,
                    arg_max(kg, measured_on)::DOUBLE AS latest_kg,
                    regr_slope(kg, epoch(measured_on) / 86400)::DOUBLE AS per_day
             FROM weight
             WHERE measured_on BETWEEN $from::DATE AND $asOf::DATE`,
            { from: daysBefore(asOf, period_days - 1), asOf },
        );
        if (!row || row.entries < 2 || row.first_kg === null || row.latest_kg === null || row.per_day === null) {
            throw new NoDataError(`Fewer than two weigh-ins in the last ${period_days} days.`);
        }
        const perWeek = row.per_day * 7;
        return {
            fields: {
                first_kg: { value: row.first_kg, unit: "kg" },
                latest_kg: { value: row.latest_kg, unit: "kg" },
                change_kg: { value: row.latest_kg - row.first_kg, unit: "kg" },
                rate: { value: perWeek, unit: "kg_per_week" },
                weigh_ins: { value: row.entries, unit: "count" },
            },
            addresses: ["plateau"],
            holds: Math.abs(perWeek) < PLATEAU_KG_PER_WEEK ? ["plateau"] : [],
        };
    },
};

export const TOOLS: QueryTool<unknown>[] = [activityRank, sleepNight, weightTrend];

/** `daysBefore("2026-10-17", 2)` is `"2026-10-15"`; negative counts move forward. */
export function daysBefore(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}
