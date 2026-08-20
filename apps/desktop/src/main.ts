import { existsSync, statSync } from "node:fs"
import { extname, join } from "node:path"
import { pathToFileURL } from "node:url"

import { Effect } from "effect"
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
} from "electron"

import { PICK_FOLDER_CHANNEL } from "./folder-picker"
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

const isDevelopment = process.env.NOYAU_DESKTOP_DEV === "1"
const isSmokeTest = process.env.NOYAU_DESKTOP_SMOKE_TEST === "1"
const appDisplayName = isDevelopment ? "Noyau (Dev)" : "Noyau"
const rendererRoot = join(__dirname, "renderer")
const preloadPath = join(__dirname, "preload.cjs")

let mainWindow: BrowserWindow | undefined
let serverSupervisor: ServerSupervisor | undefined
let quitAllowed = false
let quitInProgress = false

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
    Effect.runPromise(decodeAppearancePreference(input)).then((theme) => {
      nativeTheme.themeSource = theme
      return undefined
    }),
  )
  nativeTheme.on("updated", syncMainWindowAppearance)
}

const registerFolderPickerBridge = (): void => {
  ipcMain.handle(PICK_FOLDER_CHANNEL, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    })
    return result.canceled ? undefined : result.filePaths[0]
  })
}

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

const withSecurityHeaders = (response: Response): Response => {
  const headers = new Headers(response.headers)
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
      "connect-src 'self' http: https: ws: wss:",
      "img-src 'self' data: blob: http: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  )
  if (isDevelopment) {
    headers.set("Cache-Control", "no-store")
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const fetchDevelopmentRenderer = (requestUrl: URL): Promise<Response> => {
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, DEVELOPMENT_RENDERER_URL)
  return net.fetch(targetUrl.toString()).then(withSecurityHeaders)
}

const fetchProductionRenderer = async (requestUrl: URL): Promise<Response> => {
  const requestedAssetPath = resolveRendererAssetPath(rendererRoot, requestUrl.pathname)
  if (requestedAssetPath === undefined) {
    return new Response(null, { status: 400 })
  }

  const servesExistingFile = existsSync(requestedAssetPath) && statSync(requestedAssetPath).isFile()
  const assetPath =
    servesExistingFile || extname(requestUrl.pathname) !== ""
      ? requestedAssetPath
      : join(rendererRoot, "index.html")

  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
    return new Response(null, { status: 404 })
  }

  const response = await net.fetch(pathToFileURL(assetPath).toString())
  return withSecurityHeaders(response)
}

const registerRendererProtocol = (): void => {
  protocol.handle(DESKTOP_SCHEME, (request) => {
    const requestUrl = new URL(request.url)
    if (requestUrl.host !== DESKTOP_HOST) {
      return new Response(null, { status: 404 })
    }

    return isDevelopment
      ? fetchDevelopmentRenderer(requestUrl)
      : fetchProductionRenderer(requestUrl)
  })
}

const openExternalUrl = (url: string): void => {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") {
    void shell.openExternal(parsedUrl.toString())
  }
}

const createMainWindow = async (bootstrap: ServerBootstrap): Promise<void> => {
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
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  )
  window.once("ready-to-show", () => {
    if (!isSmokeTest) {
      window.show()
    }
  })
  window.once("closed", () => {
    if (mainWindow === window) {
      mainWindow = undefined
    }
  })
  window.webContents.once("did-finish-load", () => {
    if (isSmokeTest) {
      process.stdout.write("NOYAU_DESKTOP_SMOKE_TEST_OK\n")
      void serverSupervisor?.stop().finally(() => {
        quitAllowed = true
        app.quit()
      })
    }
  })

  await window.loadURL(desktopUrlForServer(bootstrap.host, bootstrap.port, bootstrap.bearerToken))
}

const launch = async (): Promise<void> => {
  await app.whenReady()
  const externalBootstrap = decodeExternalBootstrap()
  const baseSupervisorOptions = {
    serverEntryPath: resolveServerEntryPath(__dirname),
    dataDirectory: join(app.getPath("userData"), "environment"),
    onStateChange: (state: SupervisorState) => {
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
  await serverSupervisor.start()
  registerRendererProtocol()
  registerThemeBridge()
  registerFolderPickerBridge()
  session.defaultSession.setPermissionCheckHandler(() => false)
  const bootstrap = serverSupervisor.bootstrap
  if (bootstrap === undefined) {
    throw new Error("The Noyau Server supervisor did not provide a bootstrap")
  }
  await createMainWindow(bootstrap)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow(bootstrap)
    }
  })
}

app.setName(appDisplayName)
app.setAboutPanelOptions({ applicationName: appDisplayName })
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
  void serverSupervisor
    .isTurnRunning()
    .catch(() => true)
    .then((turnRunning) => {
      if (!turnRunning) {
        return true
      }
      return dialog
        .showMessageBox({
          type: "question",
          buttons: ["Cancel", "Quit and interrupt Turn"],
          defaultId: 0,
          cancelId: 0,
          title: "Quit Noyau?",
          message: "If a Turn is running, quitting will interrupt it.",
        })
        .then(({ response }) => {
          if (response === 0) {
            quitInProgress = false
            return false
          }
          return true
        })
    })
    .then((shouldQuit) => {
      if (!shouldQuit) {
        return
      }
      return serverSupervisor?.stop().then(() => {
        quitAllowed = true
        app.quit()
        return undefined
      })
    })
    .catch((cause) => {
      quitInProgress = false
      process.stderr.write(`Failed to stop Noyau Server: ${String(cause)}\n`)
    })
})

void launch().catch((cause) => {
  process.stderr.write(`Failed to launch Noyau Desktop: ${String(cause)}\n`)
  quitAllowed = true
  app.quit()
})
