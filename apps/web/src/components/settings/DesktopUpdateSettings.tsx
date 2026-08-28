import { type ReactElement } from "react"

import { SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { useDesktopUpdate } from "@/hooks/use-desktop-update"
import { desktopAppVersion, desktopReleaseChannel, isDesktopRuntime } from "@/lib/desktop-bridge"
import {
  desktopUpdateDescription,
  desktopUpdatePrimaryAction,
  desktopUpdatePrimaryActionLabel,
  desktopUpdateVersionLine,
} from "@/lib/desktop-update"

export function DesktopUpdateSettings(): ReactElement | null {
  const { state, check, openInstaller } = useDesktopUpdate()
  if (!isDesktopRuntime()) {
    return null
  }

  const action = desktopUpdatePrimaryAction(state)
  const currentVersion = state.result?.currentVersion || desktopAppVersion()
  const description = desktopUpdateDescription(
    state,
    desktopUpdateVersionLine(currentVersion),
    desktopReleaseChannel(),
  )

  return (
    <SettingsSection id="about" title="About">
      <SettingsRow
        id="desktop-update"
        title="Version"
        description={description}
        control={
          action === null ? null : (
            <Button
              type="button"
              size="sm"
              variant={action === "open" ? "default" : "outline"}
              loading={state.phase !== "idle"}
              onClick={() => {
                if (action === "open") {
                  void openInstaller()
                  return
                }
                void check()
              }}
            >
              {desktopUpdatePrimaryActionLabel(action)}
            </Button>
          )
        }
      />
    </SettingsSection>
  )
}
