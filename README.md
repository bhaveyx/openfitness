# OpenFitness

An open-source AI fitness coach that never makes up your numbers.

AI health coaches often get your own data wrong. They call a short ride your longest, say you took hours to fall asleep when it was minutes, or tell you you've plateaued while you're losing weight every week. OpenFitness is built so that can't happen: the model decides what to look up and how to explain it, but every number you see comes straight from a query over your data.

It's early. The coaching engine and its evals work today; weekly workout plans, meal logging, Fitbit sync and a chat app come next.

## How it works

1. **Tools do the maths.** The model answers by calling typed queries over a local [DuckDB](https://duckdb.org) database: rank an activity, read a night of sleep, fit a weight trend. It never computes a figure itself.
2. **Numbers are placeholders.** The model writes `You fell asleep in {{q1.minutes_to_fall_asleep}}` and the renderer fills in `20 min` from the query result. A draft with a number typed directly in it is rejected and rewritten.
3. **Comparisons are checked.** Words like *longest*, *shortest* and *plateau* only get through in a sentence that references a result that settles them, and only if the data agrees. "Not your longest" needs the data to agree too.

The core of this is [`packages/core/src/render.ts`](packages/core/src/render.ts).

## Evals

Each eval case reproduces a failure people have reported from AI health coaches, using generated data with a known answer. The runner asks the same model the same question two ways: a baseline coach that gets the raw data in its prompt, and the grounded coach above. A judge model grades each answer against the facts.

| Case | Reported failure |
| --- | --- |
| `longest-ride` | Congratulated a user on their longest ride of the month when it was one of their shortest |
| `sleep-onset` | Said it took 3 hours to reach sound sleep when the data showed 20 minutes |
| `weight-plateau` | Insisted on a plateau after a 21 lb loss in a month |

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY
pnpm eval              # all cases
pnpm eval --case sleep-onset
```

## Development

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm test        # unit tests, no API key needed
pnpm typecheck
pnpm check       # lint and format
```

| Package | Contents |
| --- | --- |
| [`packages/core`](packages/core) | Store, query tools, renderer and the coach loop |
| [`packages/evals`](packages/evals) | Eval cases, the baseline coach, the judge and the runner |

## License

[MIT](LICENSE)
