import { useSyncExternalStore } from "react"

import {
  getProjectFolderStartDirectory,
  subscribeProjectFolderStartDirectory,
} from "@/lib/project-folder-preference"

export const useProjectFolderStartDirectory = (): string =>
  useSyncExternalStore(
    subscribeProjectFolderStartDirectory,
    getProjectFolderStartDirectory,
    getProjectFolderStartDirectory,
  )
