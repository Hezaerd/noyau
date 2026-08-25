const PROJECT_FOLDER_START_DIRECTORY_STORAGE_KEY = "noyau:project-folder-start-directory"

export const readStoredProjectFolderStartDirectory = (): string => {
  try {
    return window.localStorage.getItem(PROJECT_FOLDER_START_DIRECTORY_STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

export const persistProjectFolderStartDirectory = (directory: string): void => {
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
