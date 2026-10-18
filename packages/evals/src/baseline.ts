import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, type Timeline } from "@openfitness/core";

/**
 * The common way to build a health coach: put the user's data in the prompt and let the model
 * answer. Same model and effort as the grounded coach, so the comparison isolates the design.
 */
export async function askBaseline(
    client: Anthropic,
    question: string,
    timeline: Timeline,
    asOf: string,
    model = DEFAULT_MODEL,
): Promise<string> {
    const response = await client.messages.create({
        model,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system: `You are a fitness coach answering questions about the user's own health data. Today is ${asOf}. Keep answers short and plain.`,
        messages: [
            {
                role: "user",
                content: `My health data (local times):\n${JSON.stringify(timeline)}\n\n${question}`,
            },
        ],
    });
    if (response.stop_reason === "refusal") throw new Error("The model declined to answer.");
    return response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
}
