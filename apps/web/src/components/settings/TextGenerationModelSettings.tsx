import type { ModelSelection } from "@noyau/contracts/entities/model-selection"
import { DEFAULT_PROVIDER_INSTANCE_IDS } from "@noyau/contracts/settings"
import { RotateCcwIcon } from "lucide-react"
import { useEffect, useMemo, useState, type ReactElement } from "react"

import { SettingsRow } from "@/components/settings/settings-layout"
import { ThreadModelPicker } from "@/components/thread/ThreadModelPicker"
import { Button } from "@/components/ui/button"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProviders } from "@/hooks/use-control-plane"
import { getSettings, patchSettings } from "@/lib/control-plane"
import { showFailureToast } from "@/lib/failure-toast"
import { modelsByProvider } from "@/lib/provider-presentation"

const cursor = DEFAULT_PROVIDER_INSTANCE_IDS.cursor
const failure = {
  surface: "toast",
  tone: "warning",
  title: "Could not update the text generation model",
  persistence: "until-dismissed",
} as const

export function TextGenerationModelSettings(): ReactElement {
  const providers = useProviders()
  const catalogs = useMemo(() => modelsByProvider(providers), [providers])
  const [selection, setSelection] = useState<ModelSelection | null>(null)
  const [loaded, setLoaded] = useState(false)
  const selectedModel = catalogs[cursor]?.find((model) => model.modelId === selection?.modelId)

  useEffect(() => {
    void getSettings().then((result) => {
      if (result.ok) setSelection(result.value.textGenerationModel)
      else showFailureToast(failure)
      setLoaded(true)
      return undefined
    })
  }, [])

  const save = (next: ModelSelection | null) => {
    const previous = selection
    setSelection(next)
    void patchSettings({ textGenerationModel: next }).then((result) => {
      if (!result.ok) {
        setSelection(previous)
        showFailureToast(failure)
      }
      return undefined
    })
  }

  return (
    <SettingsRow
      id="text-generation-model"
      title="Text generation model"
      description="Used for Thread titles, worktree names, and Git drafts. Leave unset to use Cursor defaults."
      control={
        <div className="flex flex-wrap justify-end gap-1.5">
          {selection !== null ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Use the default text generation model"
              onClick={() => save(null)}
            >
              <RotateCcwIcon />
            </Button>
          ) : null}
          <ThreadModelPicker
            modelsByProvider={catalogs}
            availableProviders={[cursor]}
            lockedProvider={cursor}
            selectedProvider={cursor}
            modelSelection={selection}
            defaultModelSelection={null}
            disabled={!loaded || (catalogs[cursor]?.length ?? 0) === 0}
            showDefaultControl={false}
            enableHotkey={false}
            onModelSelectionChange={save}
            onDefaultModelSelectionChange={() => undefined}
          />
          {(selectedModel?.reasoningEfforts.length ?? 0) > 0 && selection !== null ? (
            <Select
              items={selectedModel?.reasoningEfforts ?? []}
              value={
                selection.reasoningEffort ??
                selectedModel?.reasoningEfforts.find((item) => item.isDefault)?.value
              }
              onValueChange={(value) =>
                value !== null && save({ ...selection, reasoningEffort: value })
              }
            >
              <SelectTrigger
                size="sm"
                className="w-28"
                aria-label="Text generation reasoning effort"
              >
                <SelectValue placeholder="Effort" />
              </SelectTrigger>
              <SelectPopup>
                {selectedModel?.reasoningEfforts.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          {(selectedModel?.serviceTiers.length ?? 0) > 0 && selection !== null ? (
            <Select
              items={selectedModel?.serviceTiers ?? []}
              value={
                selection.serviceTier ??
                selectedModel?.serviceTiers.find((item) => item.isDefault)?.value
              }
              onValueChange={(value) =>
                value !== null && save({ ...selection, serviceTier: value })
              }
            >
              <SelectTrigger size="sm" className="w-28" aria-label="Text generation service tier">
                <SelectValue placeholder="Service tier" />
              </SelectTrigger>
              <SelectPopup>
                {selectedModel?.serviceTiers.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
        </div>
      }
    />
  )
}
