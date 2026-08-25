import type { CursorModel } from "@noyau/protocol/entities/environment"
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
