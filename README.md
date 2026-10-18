# OpenFitness

An AI fitness coach that answers questions about your health data without making up numbers.

I got a Fitbit and started reading what people say about the AI coaches in fitness apps. The complaint that kept coming up was that the coach gets their own data wrong. One told someone that a short ride was their longest of the month. Another said it took them three hours to fall asleep when their tracker showed twenty minutes.

So in OpenFitness the model never writes a number itself. It looks things up with queries over your data and writes its answer with placeholders like `{{q1.minutes_to_fall_asleep}}`, which the app fills in from the query results. If the model types a number on its own, or calls a ride your longest when the data says it isn't, the answer is rejected and the model has to rewrite it. The checking happens in [`packages/core/src/render.ts`](packages/core/src/render.ts) and the queries are in [`tools.ts`](packages/core/src/tools.ts).

What works today is the coaching engine and a few evals. Workout plans, meal logging, Fitbit sync and a chat app are next.

## Evals

Each eval recreates one of those reported failures with made-up data where the right answer is known. It asks the same question twice, once with the raw data pasted into the prompt (how most coaches work) and once through OpenFitness, and a separate model grades both answers against the facts. Both use the same model and settings, so the only difference is the design.

- `longest-ride`: a short ride called the longest of the month
- `sleep-onset`: twenty minutes to fall asleep reported as three hours
- `weight-plateau`: a plateau insisted on after losing 21 lb in a month

I haven't run them against the model yet, so there are no results here. They'll go in this section once I do. If you want to try them yourself, you need an Anthropic API key:

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY
pnpm eval
pnpm eval --case sleep-onset
```

## Running it locally

You need Node 22 and pnpm.

```bash
pnpm install
pnpm test        # unit tests, no API key needed
pnpm typecheck
pnpm check       # lint and format
```

The engine is in `packages/core` and the evals are in `packages/evals`.

## License

MIT
