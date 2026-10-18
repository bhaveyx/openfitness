import type Anthropic from "@anthropic-ai/sdk";
import { RenderError, render } from "./render";
import type { QueryResult } from "./result";
import type { Store } from "./store";
import { NoDataError, TOOLS } from "./tools";

export const DEFAULT_MODEL = "claude-opus-5-5";

export interface CoachOptions {
    client: Anthropic;
    store: Store;
    /** Local date the question is asked on, `YYYY-MM-DD`. */
    asOf: string;
    model?: string;
    /** How many times the model may rewrite a draft the renderer rejected. */
    maxRewrites?: number;
}

export interface Receipt {
    id: string;
    tool: string;
    input: unknown;
    result: QueryResult;
}

export interface Answer {
    text: string;
    receipts: Receipt[];
    rewrites: number;
}

function systemPrompt(asOf: string): string {
    return `You are a fitness coach answering questions about the user's own health data. Today is ${asOf}.

Look up every fact with the tools before answering. Each tool result has an id such as q1 and named fields.
You never write numbers, dates or times yourself. Write a placeholder like {{q1.minutes_to_fall_asleep}} and the app fills in the formatted value with its unit.
Words such as longest, shortest and plateau are checked against the results referenced in the same sentence, so only use them in a sentence that includes a placeholder from the result that settles them.
If the data can't answer the question, say so. Keep answers short and plain.`;
}

export async function ask(question: string, options: CoachOptions): Promise<Answer> {
    const { client, store, asOf, model = DEFAULT_MODEL, maxRewrites = 2 } = options;
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
    const results = new Map<string, QueryResult>();
    const receipts: Receipt[] = [];
    let rewrites = 0;

    while (true) {
        const response = await client.beta.messages.create({
            model,
            max_tokens: 16000,
            output_config: { effort: "medium" },
            system: systemPrompt(asOf),
            tools: TOOLS.map((tool) => tool.definition),
            messages,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
        });
        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "refusal") throw new Error("The model declined to answer.");
        if (response.stop_reason === "max_tokens") throw new Error("The answer ran past the token limit.");

        const toolUses = response.content.filter((b) => b.type === "tool_use");
        if (toolUses.length > 0) {
            const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
            for (const use of toolUses) {
                const tool = TOOLS.find((t) => t.definition.name === use.name);
                try {
                    if (!tool) throw new NoDataError(`Unknown tool ${use.name}.`);
                    const result = await tool.run(use.input, { store, asOf });
                    const id = `q${results.size + 1}`;
                    results.set(id, result);
                    receipts.push({ id, tool: use.name, input: use.input, result });
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: use.id,
                        content: JSON.stringify({ id, fields: result.fields }),
                    });
                } catch (error) {
                    if (!(error instanceof NoDataError)) throw error;
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: use.id,
                        content: error.message,
                        is_error: true,
                    });
                }
            }
            messages.push({ role: "user", content: toolResults });
            continue;
        }

        const draft = response.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("");
        try {
            return { text: render(draft, results), receipts, rewrites };
        } catch (error) {
            if (!(error instanceof RenderError) || rewrites >= maxRewrites) throw error;
            rewrites++;
            messages.push({
                role: "user",
                content: `Your reply wasn't shown to the user because:\n${error.problems.map((p) => `- ${p}`).join("\n")}\nRewrite it.`,
            });
        }
    }
}
