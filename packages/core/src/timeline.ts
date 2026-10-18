export type ActivityType = "ride" | "run" | "walk" | "strength";

/**
 * A person's health history as plain records.
 *
 * Timestamps are local wall-clock time in ISO 8601 without an offset (`2026-10-17T07:30:00`).
 * A single user lives in one timezone at a time, and coaching talks about local days and nights,
 * so storing local time avoids converting on every question.
 */
export interface Timeline {
    activities: Activity[];
    sleep: SleepNight[];
    weight: WeightEntry[];
}

export interface Activity {
    id: string;
    type: ActivityType;
    start: string;
    durationMin: number;
    distanceKm: number | null;
}

export interface SleepNight {
    /** The date the night ends on, so "last night" on 17 October is filed under `2026-10-17`. */
    nightOf: string;
    inBed: string;
    asleep: string;
    firstDeep: string | null;
    wake: string;
}

export interface WeightEntry {
    date: string;
    kg: number;
}
