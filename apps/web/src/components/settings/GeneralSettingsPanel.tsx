import { Undo2Icon } from "lucide-react"
import { useId, useState, type ReactElement } from "react"

import { ProjectAgentIntegrationSettings } from "@/components/settings/ProjectAgentIntegrationSettings"
import { SettingsPage, SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useDiscordPresenceEnabled } from "@/hooks/use-discord-presence-enabled"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import { setDiscordPresenceEnabled } from "@/lib/discord-presence-preference"
import { setProjectFolderStartDirectory } from "@/lib/project-folder-preference"

export function GeneralSettingsPanel(): ReactElement {
  const startDirectory = useProjectFolderStartDirectory()
  const discordPresenceEnabled = useDiscordPresenceEnabled()
  const discordPresenceSwitchId = useId()
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
      <SettingsSection id="autre" title="Autre">
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
