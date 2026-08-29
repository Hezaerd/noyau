import { useAppAtomValue } from "@/hooks/use-app-atom"
import { projectFolderStartDirectoryAtom } from "@/state/preferences"

export const useProjectFolderStartDirectory = (): string =>
  useAppAtomValue(projectFolderStartDirectoryAtom)
