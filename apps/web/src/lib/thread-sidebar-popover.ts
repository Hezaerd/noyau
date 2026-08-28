import type { CursorModel, Provider } from "@noyau/contracts/entities/environment"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"

export const threadModelLabel = (
  modelSelection: ModelSelection | null,
  models: ReadonlyArray<Pick<CursorModel, "modelId" | "label">>,
): string => {
  if (modelSelection === null) {
    return "Auto"
  }
  return (
    models.find((model) => model.modelId === modelSelection.modelId)?.label ??
    modelSelection.modelId
  )
}

export const catalogModels = (
  provider: Provider,
  catalogs: {
    readonly cursor?: ReadonlyArray<Pick<CursorModel, "modelId" | "label">> | undefined
    readonly claude?: ReadonlyArray<Pick<CursorModel, "modelId" | "label">> | undefined
    readonly codex?: ReadonlyArray<Pick<CursorModel, "modelId" | "label">> | undefined
  },
): ReadonlyArray<Pick<CursorModel, "modelId" | "label">> =>
  provider === "claude"
    ? (catalogs.claude ?? [])
    : provider === "codex"
      ? (catalogs.codex ?? [])
      : (catalogs.cursor ?? [])
