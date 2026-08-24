import { type ReactElement, useId } from "react"

import { SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDesktopUpdate } from "@/hooks/use-desktop-update"
import { useDesktopUpdateChannel } from "@/hooks/use-desktop-update-channel"
import {
  desktopAppVersion,
  desktopChannelHint,
  desktopReleaseChannel,
  isDesktopRuntime,
} from "@/lib/desktop-bridge"
import {
  desktopUpdateDescription,
  desktopUpdatePrimaryAction,
  desktopUpdatePrimaryActionLabel,
  desktopUpdateVersionLine,
} from "@/lib/desktop-update"
import {
  DESKTOP_UPDATE_CHANNEL_ITEMS,
  isDesktopUpdatePackagedChannel,
  setDesktopUpdateChannel,
} from "@/lib/desktop-update-channel-preference"

export function DesktopUpdateSettings(): ReactElement | null {
  const { state, check, openInstaller } = useDesktopUpdate()
  const updateChannel = useDesktopUpdateChannel()
  const channelSelectId = useId()
  const packagedChannel = desktopReleaseChannel()
  if (!isDesktopRuntime()) {
    return null
  }
  const showChannelPicker = packagedChannel !== "development"

  const action = desktopUpdatePrimaryAction(state)
  const currentVersion = state.result?.currentVersion || desktopAppVersion()
  const description = desktopUpdateDescription(
    state,
    desktopUpdateVersionLine(currentVersion, desktopChannelHint(packagedChannel)),
    packagedChannel,
  )

  return (
    <SettingsSection id="application" title="Application">
      {showChannelPicker ? (
        <SettingsRow
          id="desktop-update-channel"
          title="Canal de mise à jour"
          description="Piste GitHub à vérifier. L’autre canal installe une app séparée, ça ne remplace pas celle-ci."
          control={
            <Select
              items={DESKTOP_UPDATE_CHANNEL_ITEMS}
              value={updateChannel}
              onValueChange={(next) => {
                if (next !== null && isDesktopUpdatePackagedChannel(next)) {
                  setDesktopUpdateChannel(next)
                  void check()
                }
              }}
            >
              <SelectTrigger
                id={channelSelectId}
                size="sm"
                className="w-full sm:w-36"
                aria-label="Canal de mise à jour"
                disabled={state.phase !== "idle"}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {DESKTOP_UPDATE_CHANNEL_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      ) : null}
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
