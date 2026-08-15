import { existsSync, statSync } from "node:fs"
import { extname, join } from "node:path"
import { pathToFileURL } from "node:url"

import { app, BrowserWindow, net, protocol, session, shell } from "electron"

import {
  DESKTOP_HOST,
  DESKTOP_SCHEME,
  DESKTOP_URL,
  DEVELOPMENT_RENDERER_URL,
  resolveRendererAssetPath,
} from "./renderer"

const isDevelopment = process.env.NOYAU_DESKTOP_DEV === "1"
const isSmokeTest = process.env.NOYAU_DESKTOP_SMOKE_TEST === "1"
const rendererRoot = join(__dirname, "renderer")
const preloadPath = join(__dirname, "preload.cjs")

let mainWindow: BrowserWindow | undefined

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

const registerRendererProtocol = async (): Promise<void> => {
  await protocol.handle(DESKTOP_SCHEME, (request) => {
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

const createMainWindow = async (): Promise<void> => {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 840,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#111318",
    title: "Noyau",
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
      app.quit()
    }
  })

  await window.loadURL(DESKTOP_URL)
}

const launch = async (): Promise<void> => {
  await app.whenReady()
  await registerRendererProtocol()
  session.defaultSession.setPermissionCheckHandler(() => false)
  await createMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })
}

app.setName("Noyau")
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

void launch().catch((error: unknown) => {
  process.stderr.write(`Failed to launch Noyau Desktop: ${String(error)}\n`)
  app.quit()
})
