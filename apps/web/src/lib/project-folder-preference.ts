const PROJECT_FOLDER_START_DIRECTORY_STORAGE_KEY = "noyau:project-folder-start-directory"
const listeners = new Set<() => void>()

let currentProjectFolderStartDirectory = ""
let initialized = false

const readStoredProjectFolderStartDirectory = (): string => {
  try {
    return window.localStorage.getItem(PROJECT_FOLDER_START_DIRECTORY_STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

const persistProjectFolderStartDirectory = (directory: string): void => {
  try {
    if (directory === "") {
      window.localStorage.removeItem(PROJECT_FOLDER_START_DIRECTORY_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(PROJECT_FOLDER_START_DIRECTORY_STORAGE_KEY, directory)
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const initializeProjectFolderStartDirectory = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  currentProjectFolderStartDirectory = readStoredProjectFolderStartDirectory()
}

export const getProjectFolderStartDirectory = (): string => currentProjectFolderStartDirectory

export const subscribeProjectFolderStartDirectory = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setProjectFolderStartDirectory = (directory: string): void => {
  const nextDirectory = directory.trim()
  if (nextDirectory === currentProjectFolderStartDirectory) {
    return
  }
  currentProjectFolderStartDirectory = nextDirectory
  persistProjectFolderStartDirectory(nextDirectory)
  emitChange()
}
