import { Undo2Icon } from "lucide-react"
import { useId, useState, type ReactElement } from "react"

import { DesktopUpdateSettings } from "@/components/settings/DesktopUpdateSettings"
import { ProjectAgentIntegrationSettings } from "@/components/settings/ProjectAgentIntegrationSettings"
import { SettingsPage, SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsiblePanel } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useDiscordPresenceEnabled } from "@/hooks/use-discord-presence-enabled"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import { useThreadEnvModePreference } from "@/hooks/use-thread-env-mode-preference"
import {
  useAutoSettleAfterDays,
  useAutoSettleOnMergeEnabled,
} from "@/hooks/use-thread-settle-preference"
import { useTurnCuePreference } from "@/hooks/use-turn-cue"
import { THREAD_ENV_MODE_ITEMS } from "@/lib/checkout"
import { isThreadEnvMode } from "@/lib/thread-env-mode-preference"
import { DEFAULT_AUTO_SETTLE_AFTER_DAYS } from "@/lib/thread-settle-preference"
import {
  isTurnCueSound,
  playTurnCue,
  TURN_CUE_SOUND_ITEMS,
  type TurnCueSound,
} from "@/lib/turn-cue"
import {
  setDiscordPresenceEnabled,
  setProjectFolderStartDirectory,
  setThreadEnvModePreference,
  setTurnCueEnabled,
  setTurnCueSound,
} from "@/state/preferences"
import { setAutoSettleAfterDays, setAutoSettleOnMergeEnabled } from "@/state/thread-settle"

const selectTurnCueSound = (sound: TurnCueSound): void => {
  setTurnCueSound(sound)
  playTurnCue(sound)
}

export function GeneralSettingsPanel(): ReactElement {
  const startDirectory = useProjectFolderStartDirectory()
  const defaultThreadEnvMode = useThreadEnvModePreference()
  const autoSettleOnMerge = useAutoSettleOnMergeEnabled()
  const autoSettleAfterDays = useAutoSettleAfterDays()
  const discordPresenceEnabled = useDiscordPresenceEnabled()
  const turnCue = useTurnCuePreference()
  const discordPresenceSwitchId = useId()
  const autoSettleOnMergeSwitchId = useId()
  const autoSettleAfterDaysSwitchId = useId()
  const autoSettleAfterDaysInputId = useId()
  const threadEnvModeSelectId = useId()
  const turnCueSwitchId = useId()
  const turnCueSoundSelectId = useId()
  const [draft, setDraft] = useState<string | undefined>()
  const value = draft ?? startDirectory

  const commit = (): void => {
    if (draft === undefined) {
      return
    }
    setProjectFolderStartDirectory(draft)
    setDraft(undefined)
  }

  return (
    <SettingsPage>
      <SettingsSection id="projects" title="Projects">
        <SettingsRow
          id="project-folder-start-directory"
          title="Add a Project starts in"
          description='Leave empty to open the folder picker in "~/".'
          control={
            <div className="flex gap-1.5">
              {startDirectory !== "" ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Reset the Project start folder"
                  onClick={() => {
                    setProjectFolderStartDirectory("")
                    setDraft(undefined)
                  }}
                >
                  <Undo2Icon />
                </Button>
              ) : null}
              <Input
                aria-label="Start folder when adding a Project"
                className="w-full sm:w-72"
                placeholder="~/"
                spellCheck={false}
                value={value}
                onBlur={commit}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur()
                  }
                }}
              />
            </div>
          }
        />
        <ProjectAgentIntegrationSettings />
      </SettingsSection>
      <SettingsSection id="threads" title="Threads">
        <SettingsRow
          id="default-thread-env-mode"
          title="Checkout for a new Thread"
          description="Draft intent for the first Turn. The Composer can still change it."
          control={
            <Select
              items={THREAD_ENV_MODE_ITEMS}
              value={defaultThreadEnvMode}
              onValueChange={(next) => {
                if (next !== null && isThreadEnvMode(next)) {
                  setThreadEnvModePreference(next)
                }
              }}
            >
              <SelectTrigger
                id={threadEnvModeSelectId}
                size="sm"
                className="w-full sm:w-52"
                aria-label="Checkout for a new Thread"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {THREAD_ENV_MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          id="auto-settle-merged-threads"
          title="Settle after PR merge"
          description="Settle the Thread when its live PR is merged. A closed PR always settles."
          control={
            <Switch
              id={autoSettleOnMergeSwitchId}
              checked={autoSettleOnMerge}
              aria-label="Automatically settle after a PR merge"
              onCheckedChange={(checked) => setAutoSettleOnMergeEnabled(checked)}
            />
          }
        />
        <SettingsRow
          id="auto-settle-inactive-threads"
          title="Settle after inactivity"
          description="Settle Threads with no activity for this many days."
          control={
            <Switch
              id={autoSettleAfterDaysSwitchId}
              checked={autoSettleAfterDays !== null}
              aria-label="Automatically settle after inactivity"
              onCheckedChange={(checked) =>
                setAutoSettleAfterDays(checked ? DEFAULT_AUTO_SETTLE_AFTER_DAYS : null)
              }
            />
          }
        />
        {autoSettleAfterDays !== null ? (
          <SettingsRow
            id="auto-settle-after-days"
            className="bg-muted/20 pl-7 sm:pl-9"
            title="Inactivity days"
            description="New activity automatically unsettles the Thread."
            control={
              <Input
                id={autoSettleAfterDaysInputId}
                type="number"
                min={1}
                max={90}
                className="w-20"
                aria-label="Inactivity days before settling"
                value={String(autoSettleAfterDays)}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10)
                  if (Number.isFinite(next)) {
                    setAutoSettleAfterDays(next)
                  }
                }}
              />
            }
          />
        ) : null}
      </SettingsSection>
      <SettingsSection id="autre" title="Other">
        <SettingsRow
          id="turn-cue"
          title="Turn end sound"
          description="Play a ding when a Turn finishes."
          control={
            <Switch
              id={turnCueSwitchId}
              checked={turnCue.enabled}
              aria-label="Enable the Turn end sound"
              onCheckedChange={(checked) => {
                setTurnCueEnabled(checked)
                if (checked) {
                  playTurnCue(turnCue.sound)
                }
              }}
            />
          }
        />
        <Collapsible open={turnCue.enabled}>
          <CollapsiblePanel>
            <SettingsRow
              id="turn-cue-sound"
              className="bg-muted/20 pl-7 sm:pl-9"
              title="Sound"
              description="Played at the end of a Turn."
              control={
                <Select
                  items={TURN_CUE_SOUND_ITEMS}
                  value={turnCue.sound}
                  onValueChange={(next) => {
                    if (next !== null && isTurnCueSound(next)) {
                      selectTurnCueSound(next)
                    }
                  }}
                >
                  <SelectTrigger
                    id={turnCueSoundSelectId}
                    size="sm"
                    className="w-full sm:w-44"
                    aria-label="Turn end sound"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {TURN_CUE_SOUND_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              }
            />
          </CollapsiblePanel>
        </Collapsible>
        <SettingsRow
          id="discord-rich-presence"
          title="Discord Rich Presence"
          description="Show the open Project and Thread, or Board. Discord desktop must be running."
          control={
            <Switch
              id={discordPresenceSwitchId}
              checked={discordPresenceEnabled}
              aria-label="Enable Discord Rich Presence"
              onCheckedChange={(checked) => setDiscordPresenceEnabled(checked)}
            />
          }
        />
      </SettingsSection>
      <DesktopUpdateSettings />
    </SettingsPage>
  )
}
