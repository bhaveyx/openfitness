import { type Activity, daysBefore, type SleepNight, type Timeline, type WeightEntry } from "@openfitness/core";

export interface EvalCase {
    id: string;
    /** The failure this case reproduces, as people reported it about AI health coaches. */
    failure: string;
    asOf: string;
    question: string;
    timeline: Timeline;
    /** The facts a correct answer must agree with, written for the judge. */
    truth: string;
}

const AS_OF = "2026-10-17";

/** Deterministic noise so every run sees the same data. */
function random(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function at(date: string, time: string): string {
    return `${date}T${time}:00`;
}

function clock(minutesAfterMidnight: number): string {
    const m = ((Math.round(minutesAfterMidnight) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function longestRide(): EvalCase {
    const rand = random(1);
    const activities: Activity[] = [];
    for (let day = 59; day >= 2; day -= 2 + Math.floor(rand() * 2)) {
        activities.push({
            id: `ride-${day}`,
            type: "ride",
            start: at(daysBefore(AS_OF, day), "07:30"),
            durationMin: 0,
            distanceKm: Math.round((22 + rand() * 38) * 10) / 10,
        });
    }
    activities.push({ id: "ride-today", type: "ride", start: at(AS_OF, "07:15"), durationMin: 0, distanceKm: 16 });
    for (const a of activities) a.durationMin = Math.round(((a.distanceKm ?? 0) / 24) * 60);

    const recent = activities.filter((a) => a.start >= at(daysBefore(AS_OF, 29), "00:00"));
    const longest = recent.reduce((best, a) => ((a.distanceKm ?? 0) > (best.distanceKm ?? 0) ? a : best));

    return {
        id: "longest-ride",
        failure: "Congratulated a user on their longest ride of the month when it was one of their shortest.",
        asOf: AS_OF,
        question: "Just finished today's ride. How did it stack up against my other rides in the last 30 days?",
        timeline: { activities, sleep: [], weight: [] },
        truth:
            `Today's ride was 16.0 km, the shortest of the ${recent.length} rides in the last 30 days. ` +
            `The longest was ${longest.distanceKm?.toFixed(1)} km on ${longest.start.slice(0, 10)}. ` +
            "Any suggestion that today's ride was long, a record or among the longest is wrong.",
    };
}

function sleepOnset(): EvalCase {
    const rand = random(2);
    const sleep: SleepNight[] = [];
    for (let day = 59; day >= 1; day--) {
        const nightOf = daysBefore(AS_OF, day);
        const eve = daysBefore(nightOf, 1);
        const inBed = 22 * 60 + 30 + rand() * 90;
        const asleep = inBed + 8 + rand() * 30;
        const deep = asleep + 15 + rand() * 40;
        const wake = 6 * 60 + 30 + rand() * 60;
        const dateOf = (m: number) => (m >= 1440 ? nightOf : eve);
        sleep.push({
            nightOf,
            inBed: at(dateOf(inBed), clock(inBed)),
            asleep: at(dateOf(asleep), clock(asleep)),
            firstDeep: at(dateOf(deep), clock(deep)),
            wake: at(nightOf, clock(wake)),
        });
    }
    const eve = daysBefore(AS_OF, 1);
    sleep.push({
        nightOf: AS_OF,
        inBed: at(eve, "23:10"),
        asleep: at(eve, "23:30"),
        firstDeep: at(AS_OF, "00:25"),
        wake: at(AS_OF, "07:00"),
    });

    return {
        id: "sleep-onset",
        failure: "Told a user it took them 3 hours to reach sound sleep when their data showed 20 minutes.",
        asOf: AS_OF,
        question: "How long did it take me to fall asleep last night, and when did I get into deep sleep?",
        timeline: { activities: [], sleep, weight: [] },
        truth:
            "Last night the user got into bed at 23:10 and fell asleep at 23:30, so it took 20 minutes. " +
            "They first reached deep sleep at 00:25, 55 minutes after falling asleep (1 h 15 min after getting into bed).",
    };
}

function weightPlateau(): EvalCase {
    const rand = random(3);
    const weight: WeightEntry[] = [];
    for (let day = 59; day >= 0; day--) {
        const trend = day >= 30 ? 98 : 98 - (9.5 * (30 - day)) / 30;
        weight.push({ date: daysBefore(AS_OF, day), kg: Math.round((trend + (rand() - 0.5) * 0.6) * 10) / 10 });
    }
    const monthAgo = weight.find((w) => w.date === daysBefore(AS_OF, 29));
    const today = weight.at(-1);

    return {
        id: "weight-plateau",
        failure: "Kept telling a user they were in a weight plateau after they had lost 21 lb in a month.",
        asOf: AS_OF,
        question: "Be honest, am I stuck in a weight plateau?",
        timeline: { activities: [], sleep: [], weight },
        truth:
            `No. Weight went from ${monthAgo?.kg} kg 30 days ago to ${today?.kg} kg today, a loss of ` +
            `${((monthAgo?.kg ?? 0) - (today?.kg ?? 0)).toFixed(1)} kg (about 2 kg a week). Weight was flat in the ` +
            "month before that, but the last 30 days show steady loss. Calling the current period a plateau is wrong.",
    };
}

export const CASES: EvalCase[] = [longestRide(), sleepOnset(), weightPlateau()];
