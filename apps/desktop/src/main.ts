import { pathToFileURL } from "node:url"

import * as NodeServices from "@effect/platform-node/NodeServices"
import { Config, Effect, FileSystem, Layer, ManagedRuntime, Option, Path, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  screen,
  session,
  shell,
} from "electron"

import { cursorPointInContent, GET_CURSOR_POINT_CHANNEL } from "./cursor-point"
import {
  type FolderPickerOptions,
  PICK_FOLDER_CHANNEL,
  resolveFolderPickerDefaultPath,
} from "./folder-picker"
import { isRendererPermissionAllowed } from "./permissions"
import {
  DESKTOP_HOST,
  DESKTOP_SCHEME,
  DESKTOP_URL,
  DEVELOPMENT_RENDERER_URL,
  desktopUrlForServer,
  resolveRendererAssetPath,
} from "./renderer"
import {
  decodeExternalBootstrap,
  resolveServerEntryPath,
  ServerSupervisor,
  type ServerBootstrap,
  type ServerSupervisorOptions,
  type SupervisorState,
} from "./supervisor"
import { SET_THEME_CHANNEL } from "./theme"
import { decodeAppearancePreference } from "./theme-schema"
import {
  getTitleBarOverlayOptions,
  getWindowBackgroundColor,
  getWindowTitleBarOptions,
} from "./window-chrome"

const desktopRuntime = ManagedRuntime.make(
  Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer),
)

class DesktopError extends Schema.TaggedError<DesktopError>()("DesktopError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

const desktopError = (message: string, cause?: unknown) =>
  new DesktopError(cause === undefined ? { message } : { message, cause })

const SmokeControlPayload = Schema.Struct({
  state: Schema.Unknown,
  bootstrap: Schema.NullOr(Schema.Unknown),
})
const encodeSmokeControl = Schema.encodeEffect(Schema.fromJsonString(SmokeControlPayload))

interface DesktopFlags {
  readonly isDevelopment: boolean
  readonly isSmokeTest: boolean
  readonly smokeCompleteFile: Option.Option<string>
  readonly smokeControlFile: Option.Option<string>
}

let flags: DesktopFlags = {
  isDevelopment: false,
  isSmokeTest: false,
  smokeCompleteFile: Option.none(),
  smokeControlFile: Option.none(),
}
let rendererRoot = ""
let preloadPath = ""
let mainWindow: BrowserWindow | undefined
let serverSupervisor: ServerSupervisor | undefined
let quitAllowed = false
let quitInProgress = false

const loadDesktopFlags = Effect.fn("loadDesktopFlags")(function* () {
  return {
    isDevelopment: yield* Config.boolean("NOYAU_DESKTOP_DEV").pipe(Config.withDefault(false)),
    isSmokeTest: yield* Config.boolean("NOYAU_DESKTOP_SMOKE_TEST").pipe(Config.withDefault(false)),
    smokeCompleteFile: yield* Config.option(Config.string("NOYAU_DESKTOP_SMOKE_COMPLETE_FILE")),
    smokeControlFile: yield* Config.option(Config.string("NOYAU_DESKTOP_SMOKE_CONTROL_FILE")),
  } satisfies DesktopFlags
})

const publishSmokeSupervisorState = Effect.fn("publishSmokeSupervisorState")(function* (
  state: SupervisorState,
) {
  if (!flags.isSmokeTest || Option.isNone(flags.smokeControlFile)) {
    return
  }
  const fs = yield* FileSystem.FileSystem
  const controlFile = flags.smokeControlFile.value
  const temporaryPath = `${controlFile}.tmp`
  const encoded = yield* encodeSmokeControl({
    state,
    bootstrap: serverSupervisor?.bootstrap ?? null,
  })
  yield* fs.writeFileString(temporaryPath, `${encoded}\n`, { mode: 0o600 })
  yield* fs.rename(temporaryPath, controlFile)
})

const waitForSmokeCompletion = Effect.fn("waitForSmokeCompletion")(function* () {
  const completeFile = Option.getOrUndefined(flags.smokeCompleteFile)
  if (completeFile === undefined) {
    return yield* desktopError(
      "NOYAU_DESKTOP_SMOKE_COMPLETE_FILE is required by the desktop smoke test",
    )
  }
  const fs = yield* FileSystem.FileSystem
  while (!(yield* fs.exists(completeFile))) {
    yield* Effect.sleep(25)
  }
})

const syncMainWindowAppearance = (): void => {
  if (mainWindow === undefined || mainWindow.isDestroyed()) {
    return
  }

  const shouldUseDarkColors = nativeTheme.shouldUseDarkColors
  mainWindow.setBackgroundColor(getWindowBackgroundColor(shouldUseDarkColors))
  if (process.platform !== "darwin") {
    mainWindow.setTitleBarOverlay(getTitleBarOverlayOptions(shouldUseDarkColors))
  }
}

const registerThemeBridge = (): void => {
  ipcMain.handle(SET_THEME_CHANNEL, (_event, input) =>
    desktopRuntime.runPromise(decodeAppearancePreference(input)).then((theme) => {
      nativeTheme.themeSource = theme
      return undefined
    }),
  )
  nativeTheme.on("updated", syncMainWindowAppearance)
}

const registerFolderPickerBridge = (): void => {
  ipcMain.handle(PICK_FOLDER_CHANNEL, (_event, options: FolderPickerOptions | undefined) =>
    desktopRuntime.runPromise(
      Effect.promise(() =>
        dialog.showOpenDialog({
          defaultPath: resolveFolderPickerDefaultPath(options?.initialPath, app.getPath("home")),
          properties: ["openDirectory"],
        }),
      ).pipe(Effect.map((result) => (result.canceled ? undefined : result.filePaths[0]))),
    ),
  )
}

const registerCursorPointBridge = (): void => {
  ipcMain.handle(GET_CURSOR_POINT_CHANNEL, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window === null || window.isDestroyed() || !window.isFocused()) {
      return undefined
    }
    return cursorPointInContent(screen.getCursorScreenPoint(), window.getContentBounds())
  })
}

const withSecurityHeaders = (response: Response): Response => {
  const headers = new Headers(response.headers)
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${flags.isDevelopment ? " 'unsafe-eval'" : ""}`,
      "connect-src 'self' http: https: ws: wss:",
      "img-src 'self' data: blob: http: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  )
  if (flags.isDevelopment) {
    headers.set("Cache-Control", "no-store")
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const fetchDevelopmentRenderer = Effect.fn("fetchDevelopmentRenderer")(function* (requestUrl: URL) {
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, DEVELOPMENT_RENDERER_URL)
  const response = yield* Effect.tryPromise({
    try: () => net.fetch(targetUrl.toString()),
    catch: (cause) => desktopError("Failed to fetch the development renderer", cause),
  })
  return withSecurityHeaders(response)
})

const isExistingFile = Effect.fn("isExistingFile")(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem
  const exists = yield* fs.exists(filePath)
  if (!exists) {
    return false
  }
  const info = yield* fs.stat(filePath)
  return info.type === "File"
})

const fetchProductionRenderer = Effect.fn("fetchProductionRenderer")(function* (requestUrl: URL) {
  const path = yield* Path.Path
  const requestedAssetPath = yield* resolveRendererAssetPath(rendererRoot, requestUrl.pathname)
  if (requestedAssetPath === undefined) {
    return new Response(null, { status: 400 })
  }

  const servesExistingFile = yield* isExistingFile(requestedAssetPath)
  const assetPath =
    servesExistingFile || path.extname(requestUrl.pathname) !== ""
      ? requestedAssetPath
      : path.join(rendererRoot, "index.html")

  if (!(yield* isExistingFile(assetPath))) {
    return new Response(null, { status: 404 })
  }

  const response = yield* Effect.tryPromise({
    try: () => net.fetch(pathToFileURL(assetPath).toString()),
    catch: (cause) => desktopError("Failed to fetch the packaged renderer", cause),
  })
  return withSecurityHeaders(response)
})

const registerRendererProtocol = (): void => {
  protocol.handle(DESKTOP_SCHEME, (request) => {
    const requestUrl = new URL(request.url)
    if (requestUrl.host !== DESKTOP_HOST) {
      return new Response(null, { status: 404 })
    }

    return desktopRuntime.runPromise(
      flags.isDevelopment
        ? fetchDevelopmentRenderer(requestUrl)
        : fetchProductionRenderer(requestUrl),
    )
  })
}

const openExternalUrl = (url: string): void => {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") {
    void shell.openExternal(parsedUrl.toString())
  }
}

const createMainWindow = Effect.fn("createMainWindow")(function* (bootstrap: ServerBootstrap) {
  const shouldUseDarkColors = nativeTheme.shouldUseDarkColors
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 840,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: getWindowBackgroundColor(shouldUseDarkColors),
    title: "Noyau",
    ...getWindowTitleBarOptions(process.platform, shouldUseDarkColors),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow = window

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === new URL(DESKTOP_URL).origin) {
      return
    }
    event.preventDefault()
    openExternalUrl(url)
  })
  window.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(isRendererPermissionAllowed(permission))
  })
  window.once("ready-to-show", () => {
    if (!flags.isSmokeTest) {
      window.show()
    }
  })
  window.once("closed", () => {
    if (mainWindow === window) {
      mainWindow = undefined
    }
  })
  window.webContents.once("did-finish-load", () => {
    if (flags.isSmokeTest) {
      void desktopRuntime
        .runPromise(
          waitForSmokeCompletion().pipe(
            Effect.andThen(
              Effect.sync(() => {
                process.stdout.write("NOYAU_DESKTOP_SMOKE_TEST_OK\n")
              }),
            ),
            Effect.andThen(serverSupervisor?.stop() ?? Effect.void),
          ),
        )
        .finally(() => {
          quitAllowed = true
          app.quit()
        })
    }
  })

  yield* Effect.promise(() =>
    window.loadURL(desktopUrlForServer(bootstrap.host, bootstrap.port, bootstrap.bearerToken)),
  )
})

const launch = Effect.fn("launch")(function* () {
  const path = yield* Path.Path
  flags = yield* loadDesktopFlags()
  rendererRoot = path.join(__dirname, "renderer")
  preloadPath = path.join(__dirname, "preload.cjs")
  const appDisplayName = flags.isDevelopment ? "Noyau (Dev)" : "Noyau"

  protocol.registerSchemesAsPrivileged([
    {
      scheme: DESKTOP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ])
  app.setName(appDisplayName)
  app.setAboutPanelOptions({ applicationName: appDisplayName })

  yield* Effect.promise(() => app.whenReady())
  const externalBootstrap = yield* decodeExternalBootstrap()
  const baseSupervisorOptions = {
    serverEntryPath: yield* resolveServerEntryPath(__dirname),
    dataDirectory: path.join(app.getPath("userData"), "environment"),
    onStateChange: (state: SupervisorState) => {
      void desktopRuntime.runPromise(publishSmokeSupervisorState(state))
      if (state.phase === "degraded") {
        process.stderr.write(
          `[noyau-desktop] server supervisor degraded: ${state.lastError ?? "unknown"}\n`,
        )
      }
    },
  }
  const supervisorOptions: ServerSupervisorOptions =
    externalBootstrap === undefined
      ? baseSupervisorOptions
      : { ...baseSupervisorOptions, externalBootstrap }
  serverSupervisor = new ServerSupervisor(supervisorOptions)
  yield* serverSupervisor.start()
  registerRendererProtocol()
  registerThemeBridge()
  registerFolderPickerBridge()
  registerCursorPointBridge()
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    isRendererPermissionAllowed(permission),
  )
  const bootstrap = serverSupervisor.bootstrap
  if (bootstrap === undefined) {
    return yield* desktopError("The Noyau Server supervisor did not provide a bootstrap")
  }
  yield* createMainWindow(bootstrap)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void desktopRuntime.runPromise(createMainWindow(bootstrap))
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", (event) => {
  if (quitAllowed || serverSupervisor === undefined) {
    return
  }
  event.preventDefault()
  if (quitInProgress) {
    return
  }
  quitInProgress = true
  void desktopRuntime
    .runPromise(serverSupervisor.stop())
    .then(() => {
      quitAllowed = true
      app.quit()
      return desktopRuntime.dispose()
    })
    .catch((cause) => {
      quitInProgress = false
      process.stderr.write(`Failed to stop Noyau Server: ${String(cause)}\n`)
    })
})

void desktopRuntime.runPromise(launch()).catch((cause) => {
  process.stderr.write(`Failed to launch Noyau Desktop: ${String(cause)}\n`)
  quitAllowed = true
  app.quit()
})
