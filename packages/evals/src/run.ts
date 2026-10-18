import Anthropic from "@anthropic-ai/sdk";
import { ask, Store } from "@openfitness/core";
import { askBaseline } from "./baseline";
import { CASES, type EvalCase } from "./cases";
import { judge, type Verdict } from "./judge";

interface Outcome {
    answer: string;
    verdict: Verdict;
}

async function attempt(client: Anthropic, testCase: EvalCase, answer: () => Promise<string>): Promise<Outcome> {
    try {
        const text = await answer();
        return { answer: text, verdict: await judge(client, testCase.question, testCase.truth, text) };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { answer: "", verdict: { pass: false, reason: `No answer: ${message}` } };
    }
}

async function runCase(client: Anthropic, testCase: EvalCase): Promise<{ baseline: Outcome; grounded: Outcome }> {
    const store = await Store.open();
    try {
        await store.load(testCase.timeline);
        const [baseline, grounded] = await Promise.all([
            attempt(client, testCase, () => askBaseline(client, testCase.question, testCase.timeline, testCase.asOf)),
            attempt(
                client,
                testCase,
                async () => (await ask(testCase.question, { client, store, asOf: testCase.asOf })).text,
            ),
        ]);
        return { baseline, grounded };
    } finally {
        store.close();
    }
}

const only = process.argv.indexOf("--case");
const selected = only === -1 ? CASES : CASES.filter((c) => c.id === process.argv[only + 1]);
if (selected.length === 0) throw new Error(`No case named ${process.argv[only + 1]}.`);

const client = new Anthropic();
const rows: string[] = [];
let baselinePasses = 0;
let groundedPasses = 0;

for (const testCase of selected) {
    const { baseline, grounded } = await runCase(client, testCase);
    if (baseline.verdict.pass) baselinePasses++;
    if (grounded.verdict.pass) groundedPasses++;
    rows.push(
        `| ${testCase.id} | ${baseline.verdict.pass ? "pass" : "fail"} | ${grounded.verdict.pass ? "pass" : "fail"} |`,
    );

    console.log(`\n## ${testCase.id}\n${testCase.failure}\n\nQ: ${testCase.question}`);
    for (const [name, outcome] of [
        ["Baseline", baseline],
        ["Grounded", grounded],
    ] as const) {
        console.log(
            `\n${name} (${outcome.verdict.pass ? "pass" : "fail"}): ${outcome.verdict.reason}\n${outcome.answer}`,
        );
    }
}

console.log(
    `\n| Case | Baseline | Grounded |\n| --- | --- | --- |\n${rows.join("\n")}\n` +
        `| Total | ${baselinePasses}/${selected.length} | ${groundedPasses}/${selected.length} |`,
);
