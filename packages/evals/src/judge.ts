import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "@openfitness/core";

export interface Verdict {
    pass: boolean;
    reason: string;
}

const VERDICT_SCHEMA = {
    type: "object",
    properties: {
        pass: { type: "boolean" },
        reason: { type: "string" },
    },
    required: ["pass", "reason"],
    additionalProperties: false,
};

/**
 * Grades an answer against known facts. It passes only if it answers the question and states
 * nothing the facts contradict; tone and length don't count.
 */
export async function judge(client: Anthropic, question: string, truth: string, answer: string): Promise<Verdict> {
    const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 4000,
        output_config: { effort: "low", format: { type: "json_schema", schema: VERDICT_SCHEMA } },
        messages: [
            {
                role: "user",
                content:
                    "Grade a fitness coach's answer against the facts.\n" +
                    "Pass it only if it answers the question and every claim it makes agrees with the facts. " +
                    "Fail it for any wrong number, date, time, comparison or conclusion. Ignore tone and length.\n\n" +
                    `<question>${question}</question>\n<facts>${truth}</facts>\n<answer>${answer}</answer>\n\n` +
                    "Give the reason in one sentence.",
            },
        ],
    });
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("The judge returned no verdict.");
    return JSON.parse(text) as Verdict;
}
