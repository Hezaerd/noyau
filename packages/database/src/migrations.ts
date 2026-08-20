import { Effect, Layer } from "effect"
import * as Migrator from "effect/unstable/sql/Migrator"

import JournalMigration from "./migrations/001_journal.ts"
import ProjectionsMigration from "./migrations/002_projections.ts"

export const migrations: Migrator.Loader = Migrator.fromRecord({
  "1_journal": JournalMigration,
  "2_projections": ProjectionsMigration,
})

const migrate = Migrator.make({})

/** Applique les migrations SQLite statiquement importées. */
export const runMigrations = Effect.fn("runMigrations")(function* () {
  return yield* migrate({ loader: migrations })
})

/** Applique les migrations avant d'exposer la persistance à l'application. */
export const migrationsLayer = Layer.effectDiscard(runMigrations())
