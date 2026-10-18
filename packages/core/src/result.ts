export type Unit = "km" | "min" | "kg" | "kg_per_week" | "date" | "time" | "count";

export interface Field {
    value: number | string;
    unit: Unit;
}

/** Comparative words the renderer only lets through when a query result backs them. */
export type Claim = "longest" | "shortest" | "plateau";

/**
 * What a query tool returns. `addresses` lists the claims this result can settle and `holds`
 * the subset that are true, so "your longest ride" passes only next to a result that addresses
 * "longest" and holds it, and "not your longest" only next to one that addresses it and doesn't.
 */
export interface QueryResult {
    fields: Record<string, Field>;
    addresses: Claim[];
    holds: Claim[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatField({ value, unit }: Field): string {
    switch (unit) {
        case "km":
            return `${Number(value).toFixed(1)} km`;
        case "kg":
            return `${Number(value).toFixed(1)} kg`;
        case "kg_per_week": {
            const n = Number(value);
            return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)} kg/week`;
        }
        case "min":
            return formatMinutes(Number(value));
        case "count":
            return String(Math.round(Number(value)));
        case "time":
            return String(value);
        case "date": {
            const d = new Date(`${value}T00:00:00Z`);
            return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
        }
    }
}

function formatMinutes(total: number): string {
    const minutes = Math.round(total);
    if (minutes < 60) return `${minutes} min`;
    const rest = minutes % 60;
    return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}
