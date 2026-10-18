import { type DuckDBConnection, DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import type { Timeline } from "./timeline";

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS activities (
        id VARCHAR PRIMARY KEY,
        type VARCHAR NOT NULL,
        start_at TIMESTAMP NOT NULL,
        duration_min DOUBLE NOT NULL,
        distance_km DOUBLE
    );
    CREATE TABLE IF NOT EXISTS sleep_nights (
        night_of DATE PRIMARY KEY,
        in_bed_at TIMESTAMP NOT NULL,
        asleep_at TIMESTAMP NOT NULL,
        first_deep_at TIMESTAMP,
        wake_at TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS weight (
        measured_on DATE PRIMARY KEY,
        kg DOUBLE NOT NULL
    );
`;

export type Params = Record<string, DuckDBValue>;

export class Store {
    private constructor(
        private readonly instance: DuckDBInstance,
        private readonly connection: DuckDBConnection,
    ) {}

    /** Opens a DuckDB file, or an in-memory database when no path is given. */
    static async open(path = ":memory:"): Promise<Store> {
        const instance = await DuckDBInstance.create(path);
        const connection = await instance.connect();
        await connection.run(SCHEMA);
        return new Store(instance, connection);
    }

    async load(timeline: Timeline): Promise<void> {
        for (const a of timeline.activities) {
            await this.connection.run(
                "INSERT OR REPLACE INTO activities VALUES ($id, $type, $start::TIMESTAMP, $duration, $distance)",
                { id: a.id, type: a.type, start: a.start, duration: a.durationMin, distance: a.distanceKm },
            );
        }
        for (const s of timeline.sleep) {
            await this.connection.run(
                `INSERT OR REPLACE INTO sleep_nights
                 VALUES ($night::DATE, $inBed::TIMESTAMP, $asleep::TIMESTAMP, $deep::TIMESTAMP, $wake::TIMESTAMP)`,
                { night: s.nightOf, inBed: s.inBed, asleep: s.asleep, deep: s.firstDeep, wake: s.wake },
            );
        }
        for (const w of timeline.weight) {
            await this.connection.run("INSERT OR REPLACE INTO weight VALUES ($date::DATE, $kg)", {
                date: w.date,
                kg: w.kg,
            });
        }
    }

    /**
     * Runs a read query and returns plain rows. Cast columns in SQL to the types callers expect:
     * DuckDB returns BIGINT as `bigint` and temporal types as objects, so queries should select
     * `::INTEGER`, `::DOUBLE` or formatted strings.
     */
    async rows<T>(sql: string, params: Params = {}): Promise<T[]> {
        const reader = await this.connection.runAndReadAll(sql, params);
        return reader.getRowObjectsJS() as T[];
    }

    close(): void {
        this.connection.closeSync();
        this.instance.closeSync();
    }
}
