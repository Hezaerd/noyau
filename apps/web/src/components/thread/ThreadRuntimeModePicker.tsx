import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isRuntimeMode, runtimeModes } from "@/lib/thread-commands"

export function ThreadRuntimeModePicker({
  value,
  onChange,
}: {
  readonly value: RuntimeMode
  readonly onChange: (value: RuntimeMode) => void
}) {
  return (
    <Select
      items={runtimeModes}
      value={value}
      onValueChange={(next) => {
        if (next !== null && isRuntimeMode(next)) {
          onChange(next)
        }
      }}
    >
      <SelectTrigger aria-label="Mode d’exécution" className="w-52">
        <SelectValue>{runtimeModes.find((mode) => mode.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {runtimeModes.map((mode) => (
          <SelectItem key={mode.value} value={mode.value}>
            <span className="flex flex-col">
              <span>{mode.label}</span>
              <span className="text-[0.68rem] text-muted-foreground">{mode.description}</span>
            </span>
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  )
}
