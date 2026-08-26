import type { CursorModel, Provider } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"

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
  cursor: ReadonlyArray<Pick<CursorModel, "modelId" | "label">> | undefined,
  codex: ReadonlyArray<Pick<CursorModel, "modelId" | "label">> | undefined,
): ReadonlyArray<Pick<CursorModel, "modelId" | "label">> =>
  provider === "codex" ? (codex ?? []) : (cursor ?? [])
