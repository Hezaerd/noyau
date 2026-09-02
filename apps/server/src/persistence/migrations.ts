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
import ProjectDefaultModelMigration from "./migrations/010_project_default_model.ts"
import ThreadHardDeleteMigration from "./migrations/011_thread_hard_delete.ts"
import ThreadListedAtMigration from "./migrations/012_thread_listed_at.ts"
import ThreadContextUsageMigration from "./migrations/013_thread_context_usage.ts"
import ThreadProviderInstanceMigration from "./migrations/014_thread_provider_instance.ts"
import ThreadForksMigration from "./migrations/015_thread_forks.ts"

export const migrationsThroughContextUsage: Migrator.Loader = Migrator.fromRecord({
  "1_journal": JournalMigration,
  "2_projections": ProjectionsMigration,
  "3_thread_model_selection": ThreadModelSelectionMigration,
  "4_thread_service_tier": ThreadServiceTierMigration,
  "5_thread_thinking": ThreadThinkingMigration,
  "6_thread_checkout": ThreadCheckoutMigration,
  "7_thread_settled": ThreadSettledMigration,
  "8_turn_diff": TurnDiffMigration,
  "9_thread_provider_codex": ThreadProviderCodexMigration,
  "10_project_default_model": ProjectDefaultModelMigration,
  "11_thread_hard_delete": ThreadHardDeleteMigration,
  "12_thread_listed_at": ThreadListedAtMigration,
  "13_thread_context_usage": ThreadContextUsageMigration,
})

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
  "10_project_default_model": ProjectDefaultModelMigration,
  "11_thread_hard_delete": ThreadHardDeleteMigration,
  "12_thread_listed_at": ThreadListedAtMigration,
  "13_thread_context_usage": ThreadContextUsageMigration,
  "14_thread_provider_instance": ThreadProviderInstanceMigration,
  "15_thread_forks": ThreadForksMigration,
})

export { default as threadProviderCodexMigration } from "./migrations/009_thread_provider_codex.ts"
export { default as threadProviderInstanceMigration } from "./migrations/014_thread_provider_instance.ts"

const migrate = Migrator.make({})

/** Applique les migrations SQLite statiquement importées. */
export const runMigrations = Effect.fn("runMigrations")(function* () {
  return yield* migrate({ loader: migrations })
})

/** Applique les migrations avant d'exposer la persistance à l'application. */
export const migrationsLayer = Layer.effectDiscard(runMigrations())
