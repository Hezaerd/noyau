import { useAtomValue } from "@effect/atom-react"

import { projectFolderStartDirectoryAtom } from "@/state/preferences"

export const useProjectFolderStartDirectory = (): string =>
  useAtomValue(projectFolderStartDirectoryAtom)
