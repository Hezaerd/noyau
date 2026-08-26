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
import { useAutoRemoveMergedWorktreeEnabled } from "@/hooks/use-auto-remove-merged-worktree"
import { useDiscordPresenceEnabled } from "@/hooks/use-discord-presence-enabled"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import { useThreadEnvModePreference } from "@/hooks/use-thread-env-mode-preference"
import {
  useAutoSettleAfterDays,
  useAutoSettleOnMergeEnabled,
} from "@/hooks/use-thread-settle-preference"
import { useTurnCuePreference } from "@/hooks/use-turn-cue"
import { useTurnNotificationEnabled } from "@/hooks/use-turn-notification"
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
  setAutoRemoveMergedWorktreeEnabled,
  setDiscordPresenceEnabled,
  setProjectFolderStartDirectory,
  setThreadEnvModePreference,
  setTurnCueEnabled,
  setTurnCueSound,
  setTurnNotificationEnabled,
} from "@/state/preferences"
import { setAutoSettleAfterDays, setAutoSettleOnMergeEnabled } from "@/state/thread-settle"

const selectTurnCueSound = (sound: TurnCueSound): void => {
  setTurnCueSound(sound)
  playTurnCue(sound)
}

export function GeneralSettingsPanel(): ReactElement {
  const startDirectory = useProjectFolderStartDirectory()
  const defaultThreadEnvMode = useThreadEnvModePreference()
  const autoRemoveMergedWorktree = useAutoRemoveMergedWorktreeEnabled()
  const autoSettleOnMerge = useAutoSettleOnMergeEnabled()
  const autoSettleAfterDays = useAutoSettleAfterDays()
  const discordPresenceEnabled = useDiscordPresenceEnabled()
  const turnCue = useTurnCuePreference()
  const turnNotificationEnabled = useTurnNotificationEnabled()
  const discordPresenceSwitchId = useId()
  const autoRemoveMergedWorktreeSwitchId = useId()
  const autoSettleOnMergeSwitchId = useId()
  const autoSettleAfterDaysSwitchId = useId()
  const autoSettleAfterDaysInputId = useId()
  const threadEnvModeSelectId = useId()
  const turnCueSwitchId = useId()
  const turnCueSoundSelectId = useId()
  const turnNotificationSwitchId = useId()
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
      <DesktopUpdateSettings />
      <SettingsSection id="projects" title="Projects">
        <SettingsRow
          id="project-folder-start-directory"
          title="Ajouter un Project commence dans"
          description='Laisse vide pour ouvrir le navigateur de dossiers dans "~/".'
          control={
            <div className="flex gap-1.5">
              {startDirectory !== "" ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Rétablir le dossier de départ des Projects"
                  onClick={() => {
                    setProjectFolderStartDirectory("")
                    setDraft(undefined)
                  }}
                >
                  <Undo2Icon />
                </Button>
              ) : null}
              <Input
                aria-label="Dossier de départ pour ajouter un Project"
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
          title="Checkout d'un nouveau Thread"
          description="Intention de draft au premier Turn. Le Composer peut encore la changer."
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
                aria-label="Checkout d'un nouveau Thread"
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
          id="auto-remove-merged-worktree"
          title="Supprimer le worktree après merge"
          description="Retire le worktree lié quand la PR live est fusionnée. Le ⌘⇧ clic du sélecteur reste disponible."
          control={
            <Switch
              id={autoRemoveMergedWorktreeSwitchId}
              checked={autoRemoveMergedWorktree}
              aria-label="Supprimer automatiquement le worktree après merge de PR"
              onCheckedChange={(checked) => setAutoRemoveMergedWorktreeEnabled(checked)}
            />
          }
        />
        <SettingsRow
          id="auto-settle-merged-threads"
          title="Classer après merge de PR"
          description="Classe le Thread quand sa PR live est fusionnée. Une PR fermée classe toujours."
          control={
            <Switch
              id={autoSettleOnMergeSwitchId}
              checked={autoSettleOnMerge}
              aria-label="Classer automatiquement après merge de PR"
              onCheckedChange={(checked) => setAutoSettleOnMergeEnabled(checked)}
            />
          }
        />
        <SettingsRow
          id="auto-settle-inactive-threads"
          title="Classer après inactivité"
          description="Classe les Threads sans activité depuis ce nombre de jours."
          control={
            <Switch
              id={autoSettleAfterDaysSwitchId}
              checked={autoSettleAfterDays !== null}
              aria-label="Classer automatiquement après inactivité"
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
            title="Jours d'inactivité"
            description="Une nouvelle activité déclasse automatiquement le Thread."
            control={
              <Input
                id={autoSettleAfterDaysInputId}
                type="number"
                min={1}
                max={90}
                className="w-20"
                aria-label="Jours d'inactivité avant classement"
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
      <SettingsSection id="autre" title="Autre">
        <SettingsRow
          id="turn-cue"
          title="Son de fin de Turn"
          description="Joue un ding quand un Turn se termine."
          control={
            <Switch
              id={turnCueSwitchId}
              checked={turnCue.enabled}
              aria-label="Activer le son de fin de Turn"
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
              title="Son"
              description="Joué à la fin d'un Turn."
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
                    aria-label="Son de fin de Turn"
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
          id="turn-notification"
          title="Notifications de fin de Turn"
          description="Bannière OS quand un Turn se termine hors du Thread ouvert. Le badge compte les Threads en attente."
          control={
            <Switch
              id={turnNotificationSwitchId}
              checked={turnNotificationEnabled}
              aria-label="Activer les notifications de fin de Turn"
              onCheckedChange={(checked) => setTurnNotificationEnabled(checked)}
            />
          }
        />
        <SettingsRow
          id="discord-rich-presence"
          title="Discord Rich Presence"
          description="Affiche le Project ouvert et le Thread, ou Tableau. Discord desktop doit tourner."
          control={
            <Switch
              id={discordPresenceSwitchId}
              checked={discordPresenceEnabled}
              aria-label="Activer Discord Rich Presence"
              onCheckedChange={(checked) => setDiscordPresenceEnabled(checked)}
            />
          }
        />
      </SettingsSection>
    </SettingsPage>
  )
}
