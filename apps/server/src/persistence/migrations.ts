import { Effect, Layer } from "effect"
import * as Migrator from "effect/unstable/sql/Migrator"

import JournalMigration from "./migrations/001_journal.ts"
import ProjectionsMigration from "./migrations/002_projections.ts"
import ThreadModelSelectionMigration from "./migrations/003_thread_model_selection.ts"
import ThreadServiceTierMigration from "./migrations/004_thread_service_tier.ts"
import ThreadThinkingMigration from "./migrations/005_thread_thinking.ts"
import ThreadCheckoutMigration from "./migrations/006_thread_checkout.ts"
import ThreadSettledMigration from "./migrations/007_thread_settled.ts"
import TurnDiffMigration from "./migrations/008_turn_diff.ts"
import ThreadProviderCodexMigration from "./migrations/009_thread_provider_codex.ts"
import ThreadHardDeleteMigration from "./migrations/010_thread_hard_delete.ts"

export const migrationsThroughTurnDiff: Migrator.Loader = Migrator.fromRecord({
  "1_journal": JournalMigration,
  "2_projections": ProjectionsMigration,
  "3_thread_model_selection": ThreadModelSelectionMigration,
  "4_thread_service_tier": ThreadServiceTierMigration,
  "5_thread_thinking": ThreadThinkingMigration,
  "6_thread_checkout": ThreadCheckoutMigration,
  "7_thread_settled": ThreadSettledMigration,
  "8_turn_diff": TurnDiffMigration,
})

export const migrations: Migrator.Loader = Migrator.fromRecord({
  "1_journal": JournalMigration,
  "2_projections": ProjectionsMigration,
  "3_thread_model_selection": ThreadModelSelectionMigration,
  "4_thread_service_tier": ThreadServiceTierMigration,
  "5_thread_thinking": ThreadThinkingMigration,
  "6_thread_checkout": ThreadCheckoutMigration,
  "7_thread_settled": ThreadSettledMigration,
  "8_turn_diff": TurnDiffMigration,
  "9_thread_provider_codex": ThreadProviderCodexMigration,
  "10_thread_hard_delete": ThreadHardDeleteMigration,
})

export { default as threadProviderCodexMigration } from "./migrations/009_thread_provider_codex.ts"

const migrate = Migrator.make({})

/** Applique les migrations SQLite statiquement importées. */
export const runMigrations = Effect.fn("runMigrations")(function* () {
  return yield* migrate({ loader: migrations })
})

/** Applique les migrations avant d'exposer la persistance à l'application. */
export const migrationsLayer = Layer.effectDiscard(runMigrations())
