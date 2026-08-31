import type { ThreadEnvMode } from "@noyau/contracts/entities/checkout"
import { Atom } from "effect/unstable/reactivity"

import {
  applyAppearance,
  readStoredAppearancePreference,
  persistAppearancePreference,
  watchSystemAppearance,
} from "@/lib/appearance"
import type { AppearancePreference } from "@/lib/desktop-bridge"
import {
  persistDiscordPresence,
  readStoredDiscordPresence,
  DEFAULT_DISCORD_PRESENCE_ENABLED,
} from "@/lib/discord-presence-preference"
import {
  persistProjectFolderStartDirectory,
  readStoredProjectFolderStartDirectory,
} from "@/lib/project-folder-preference"
import {
  persistThreadEnvModePreference,
  readStoredThreadEnvModePreference,
  DEFAULT_THREAD_ENV_MODE,
} from "@/lib/thread-env-mode-preference"
import { DEFAULT_TURN_CUE_SOUND, type TurnCueSound } from "@/lib/turn-cue"
import {
  persistTurnCuePreference,
  readStoredTurnCuePreference,
  DEFAULT_TURN_CUE_ENABLED,
  type TurnCuePreference,
} from "@/lib/turn-cue-preference"
import {
  persistTurnNotificationEnabled,
  readStoredTurnNotificationEnabled,
  DEFAULT_TURN_NOTIFICATION_ENABLED,
} from "@/lib/turn-notification-preference"
import { appAtomRegistry } from "@/state/atom-registry"
import { persistWritableAtom } from "@/state/persist"

export const appearancePreferenceAtom = Atom.make<AppearancePreference>("system").pipe(
  Atom.keepAlive,
  Atom.withLabel("pref:appearance"),
)

export const threadEnvModePreferenceAtom = Atom.make<ThreadEnvMode>(DEFAULT_THREAD_ENV_MODE).pipe(
  Atom.keepAlive,
  Atom.withLabel("pref:thread-env-mode"),
)

export const discordPresenceEnabledAtom = Atom.make(DEFAULT_DISCORD_PRESENCE_ENABLED).pipe(
  Atom.keepAlive,
  Atom.withLabel("pref:discord-presence"),
)

export const projectFolderStartDirectoryAtom = Atom.make("").pipe(
  Atom.keepAlive,
  Atom.withLabel("pref:project-folder-start-directory"),
)

export const turnCuePreferenceAtom = Atom.make<TurnCuePreference>({
  enabled: DEFAULT_TURN_CUE_ENABLED,
  sound: DEFAULT_TURN_CUE_SOUND,
}).pipe(Atom.keepAlive, Atom.withLabel("pref:turn-cue"))

export const turnNotificationEnabledAtom = Atom.make(DEFAULT_TURN_NOTIFICATION_ENABLED).pipe(
  Atom.keepAlive,
  Atom.withLabel("pref:turn-notification"),
)

const once = (flag: { current: boolean }, initialize: () => void): void => {
  if (flag.current) {
    return
  }
  flag.current = true
  initialize()
}

const appearanceReady = { current: false }
const threadEnvReady = { current: false }
const discordReady = { current: false }
const folderReady = { current: false }
const turnCueReady = { current: false }
const turnNotificationReady = { current: false }

export const initializeAppearance = (): void => {
  once(appearanceReady, () => {
    persistWritableAtom(appearancePreferenceAtom, {
      read: readStoredAppearancePreference,
      write: persistAppearancePreference,
    })
    const preference = appAtomRegistry.get(appearancePreferenceAtom)
    applyAppearance(preference, true)
    watchSystemAppearance(() => {
      if (appAtomRegistry.get(appearancePreferenceAtom) === "system") {
        applyAppearance("system", true)
      }
    })
  })
}

export const initializeThreadEnvModePreference = (): void => {
  once(threadEnvReady, () => {
    persistWritableAtom(threadEnvModePreferenceAtom, {
      read: readStoredThreadEnvModePreference,
      write: persistThreadEnvModePreference,
    })
  })
}

export const initializeDiscordPresencePreference = (): void => {
  once(discordReady, () => {
    persistWritableAtom(discordPresenceEnabledAtom, {
      read: readStoredDiscordPresence,
      write: persistDiscordPresence,
    })
  })
}

export const initializeProjectFolderStartDirectory = (): void => {
  once(folderReady, () => {
    persistWritableAtom(projectFolderStartDirectoryAtom, {
      read: readStoredProjectFolderStartDirectory,
      write: persistProjectFolderStartDirectory,
    })
  })
}

export const initializeTurnCuePreference = (): void => {
  once(turnCueReady, () => {
    persistWritableAtom(turnCuePreferenceAtom, {
      read: readStoredTurnCuePreference,
      write: persistTurnCuePreference,
    })
  })
}

export const initializeTurnNotificationPreference = (): void => {
  once(turnNotificationReady, () => {
    persistWritableAtom(turnNotificationEnabledAtom, {
      read: readStoredTurnNotificationEnabled,
      write: persistTurnNotificationEnabled,
    })
  })
}

export const getAppearancePreference = (): AppearancePreference =>
  appAtomRegistry.get(appearancePreferenceAtom)

export const setAppearancePreference = (preference: AppearancePreference): void => {
  if (preference === appAtomRegistry.get(appearancePreferenceAtom)) {
    return
  }
  appAtomRegistry.set(appearancePreferenceAtom, preference)
  applyAppearance(preference, true)
}

export const getThreadEnvModePreference = (): ThreadEnvMode =>
  appAtomRegistry.get(threadEnvModePreferenceAtom)

export const setThreadEnvModePreference = (mode: ThreadEnvMode): void => {
  if (mode === appAtomRegistry.get(threadEnvModePreferenceAtom)) {
    return
  }
  appAtomRegistry.set(threadEnvModePreferenceAtom, mode)
}

export const getDiscordPresenceEnabled = (): boolean =>
  appAtomRegistry.get(discordPresenceEnabledAtom)

export const setDiscordPresenceEnabled = (enabled: boolean): void => {
  if (enabled === appAtomRegistry.get(discordPresenceEnabledAtom)) {
    return
  }
  appAtomRegistry.set(discordPresenceEnabledAtom, enabled)
}

export const getProjectFolderStartDirectory = (): string =>
  appAtomRegistry.get(projectFolderStartDirectoryAtom)

export const setProjectFolderStartDirectory = (directory: string): void => {
  const nextDirectory = directory.trim()
  if (nextDirectory === appAtomRegistry.get(projectFolderStartDirectoryAtom)) {
    return
  }
  appAtomRegistry.set(projectFolderStartDirectoryAtom, nextDirectory)
}

export const getTurnCuePreference = (): TurnCuePreference =>
  appAtomRegistry.get(turnCuePreferenceAtom)

export const setTurnCueEnabled = (enabled: boolean): void => {
  const current = appAtomRegistry.get(turnCuePreferenceAtom)
  if (current.enabled === enabled) {
    return
  }
  appAtomRegistry.set(turnCuePreferenceAtom, { enabled, sound: current.sound })
}

export const setTurnCueSound = (sound: TurnCueSound): void => {
  const current = appAtomRegistry.get(turnCuePreferenceAtom)
  if (current.sound === sound) {
    return
  }
  appAtomRegistry.set(turnCuePreferenceAtom, { enabled: current.enabled, sound })
}

export const resetTurnCuePreference = (): void => {
  appAtomRegistry.set(turnCuePreferenceAtom, {
    enabled: DEFAULT_TURN_CUE_ENABLED,
    sound: DEFAULT_TURN_CUE_SOUND,
  })
}

export const getTurnNotificationEnabled = (): boolean =>
  appAtomRegistry.get(turnNotificationEnabledAtom)

export const setTurnNotificationEnabled = (enabled: boolean): void => {
  if (enabled === appAtomRegistry.get(turnNotificationEnabledAtom)) {
    return
  }
  appAtomRegistry.set(turnNotificationEnabledAtom, enabled)
}

export const resetTurnNotificationPreference = (): void => {
  setTurnNotificationEnabled(DEFAULT_TURN_NOTIFICATION_ENABLED)
}
