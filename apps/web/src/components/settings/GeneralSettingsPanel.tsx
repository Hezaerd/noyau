import { Undo2Icon } from "lucide-react"
import { useState, type ReactElement } from "react"

import { SettingsPage, SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import { setProjectFolderStartDirectory } from "@/lib/project-folder-preference"

export function GeneralSettingsPanel(): ReactElement {
  const startDirectory = useProjectFolderStartDirectory()
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
      </SettingsSection>
    </SettingsPage>
  )
}
