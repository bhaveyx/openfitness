import { type Claim, formatField, type QueryResult } from "./result";

/** A draft that can't be shown to the user. `problems` is written for the model to act on. */
export class RenderError extends Error {
    constructor(readonly problems: string[]) {
        super(problems.join("\n"));
    }
}

const PLACEHOLDER = /\{\{\s*(q\d+)\.([a-z_]+)\s*\}\}/g;

const CLAIM_WORDS: Record<Claim, RegExp> = {
    longest: /\b(longest|furthest|farthest)\b/gi,
    shortest: /\bshortest\b/gi,
    plateau: /\b(plateau(?:ed|ing|s)?|stalled)\b/gi,
};

const NEGATION = /\b(not|never|no)\b|n['’]t\b/i;

/**
 * Turns a model's draft into the reply the user sees.
 *
 * The draft may not contain digits; every number, date and time must be a `{{qN.field}}`
 * placeholder pointing at a query result, which this fills with the formatted value. Comparative
 * claims ("longest", "plateau") are checked sentence by sentence against the results referenced
 * in that sentence. Throws a RenderError listing every problem so the model can fix them in one go.
 */
export function render(draft: string, results: ReadonlyMap<string, QueryResult>): string {
    const problems: string[] = [];

    for (const sentence of sentences(draft)) {
        const referenced = new Set<QueryResult>();
        for (const [placeholder, id, field] of sentence.matchAll(PLACEHOLDER)) {
            const result = results.get(id as string);
            if (!result) problems.push(`${placeholder} refers to ${id}, which no query returned.`);
            else if (!((field as string) in result.fields))
                problems.push(
                    `${placeholder}: ${id} has no field "${field}". It has: ${Object.keys(result.fields).join(", ")}.`,
                );
            else referenced.add(result);
        }

        const prose = sentence.replace(PLACEHOLDER, "");
        if (/\d/.test(prose)) {
            problems.push(`"${sentence.trim()}" contains a number written directly. Use a placeholder instead.`);
        }

        for (const claim of Object.keys(CLAIM_WORDS) as Claim[]) {
            for (const match of prose.matchAll(CLAIM_WORDS[claim])) {
                const negated = NEGATION.test(prose.slice(Math.max(0, (match.index ?? 0) - 30), match.index));
                const settling = [...referenced].filter((r) => r.addresses.includes(claim));
                if (settling.length === 0) {
                    problems.push(
                        `"${match[0]}" in "${sentence.trim()}" isn't backed by a result in the same sentence.`,
                    );
                } else if (settling.some((r) => r.holds.includes(claim)) === negated) {
                    problems.push(
                        `"${sentence.trim()}" contradicts the data: it ${negated ? "denies" : "claims"} "${claim}".`,
                    );
                }
            }
        }
    }

    if (problems.length > 0) throw new RenderError(problems);

    return draft.replace(PLACEHOLDER, (_, id: string, field: string) => {
        const value = results.get(id)?.fields[field];
        return value ? formatField(value) : "";
    });
}

function sentences(text: string): string[] {
    return text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 0);
}
