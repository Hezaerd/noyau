import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { FilePreviewFailed } from "@noyau/protocol/file-preview"
import {
  IMAGE_PREVIEW_BYTE_LIMIT,
  TEXT_PREVIEW_BYTE_LIMIT,
  isPathInsideWorkspace,
  readFilePreview,
} from "@noyau/server/file-preview"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

const workspace = (directory: string) => Schema.decodeEffect(WorkspaceRoot)(directory)

const PNG_1X1 = Uint8Array.of(
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1f,
  0x15,
  0xc4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0a,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9c,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0d,
  0x0a,
  0x2d,
  0xb4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e,
  0x44,
  0xae,
  0x42,
  0x60,
  0x82,
)

layer(platformLayer)("readFilePreview", (it) => {
  it.effect("sert un fichier texte relatif au WorkspaceRoot", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      yield* fileSystem.writeFileString(path.join(directory, "greet.py"), "print('salut')")

      const preview = yield* readFilePreview({
        requestedPath: "greet.py",
        workspaceRoot: yield* workspace(directory),
      })
      assert.strictEqual(preview.kind, "text")
      if (preview.kind === "text") {
        assert.strictEqual(preview.text, "print('salut')")
        assert.isFalse(preview.truncated)
      }
    }),
  )

  it.effect("tronque un texte au-delà de la limite", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      const body = "a".repeat(TEXT_PREVIEW_BYTE_LIMIT + 32)
      yield* fileSystem.writeFileString(path.join(directory, "long.txt"), body)

      const preview = yield* readFilePreview({
        requestedPath: "long.txt",
        workspaceRoot: yield* workspace(directory),
      })
      assert.strictEqual(preview.kind, "text")
      if (preview.kind === "text") {
        assert.strictEqual(preview.text.length, TEXT_PREVIEW_BYTE_LIMIT)
        assert.isTrue(preview.truncated)
      }
    }),
  )

  it.effect("sert un PNG sous le cap image", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      yield* fileSystem.writeFile(path.join(directory, "dot.png"), PNG_1X1)

      const preview = yield* readFilePreview({
        requestedPath: "dot.png",
        workspaceRoot: yield* workspace(directory),
      })
      assert.strictEqual(preview.kind, "image")
      if (preview.kind === "image") {
        assert.strictEqual(preview.mime, "image/png")
        assert.deepStrictEqual([...preview.bytes], [...PNG_1X1])
      }
    }),
  )

  it.effect("sert un SVG utf-8 comme image", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      yield* fileSystem.writeFileString(
        path.join(directory, "mark.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      )

      const preview = yield* readFilePreview({
        requestedPath: "mark.svg",
        workspaceRoot: yield* workspace(directory),
      })
      assert.strictEqual(preview.kind, "image")
      if (preview.kind === "image") {
        assert.strictEqual(preview.mime, "image/svg+xml")
      }
    }),
  )

  it.effect("refuse une image au-delà du cap", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      const bytes = new Uint8Array(IMAGE_PREVIEW_BYTE_LIMIT + 1)
      bytes.set(PNG_1X1)
      yield* fileSystem.writeFile(path.join(directory, "huge.png"), bytes)

      const preview = yield* readFilePreview({
        requestedPath: "huge.png",
        workspaceRoot: yield* workspace(directory),
      })
      assert.deepStrictEqual(
        { kind: preview.kind, reason: preview.kind === "unsupported" ? preview.reason : null },
        { kind: "unsupported", reason: "too-large" },
      )
    }),
  )

  it.effect("refuse un binaire et un dossier", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      const nested = path.join(directory, "src")
      yield* fileSystem.makeDirectory(nested)
      yield* fileSystem.writeFile(path.join(directory, "blob.bin"), Uint8Array.of(0x00, 0xff, 0x01))

      const binary = yield* readFilePreview({
        requestedPath: "blob.bin",
        workspaceRoot: yield* workspace(directory),
      })
      const folder = yield* readFilePreview({
        requestedPath: "src",
        workspaceRoot: yield* workspace(directory),
      })
      assert.strictEqual(binary.kind, "unsupported")
      if (binary.kind === "unsupported") {
        assert.strictEqual(binary.reason, "binary")
      }
      assert.strictEqual(folder.kind, "unsupported")
      if (folder.kind === "unsupported") {
        assert.strictEqual(folder.reason, "directory")
      }
    }),
  )

  it.effect("rejette une traversée et un symlink hors WorkspaceRoot", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      const outside = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-out-",
      })
      yield* fileSystem.writeFileString(path.join(outside, "secret.txt"), "nope")
      yield* fileSystem.symlink(path.join(outside, "secret.txt"), path.join(directory, "leak"))

      const escaped = yield* readFilePreview({
        requestedPath: "../secret.txt",
        workspaceRoot: yield* workspace(directory),
      }).pipe(Effect.flip)
      const leaked = yield* readFilePreview({
        requestedPath: "leak",
        workspaceRoot: yield* workspace(directory),
      }).pipe(Effect.flip)

      const hostRoot = yield* readFilePreview({
        requestedPath: "/etc/passwd",
        workspaceRoot: yield* workspace(directory),
      }).pipe(Effect.flip)

      assert.instanceOf(escaped, FilePreviewFailed)
      assert.strictEqual(escaped.reason, "outside-workspace")
      assert.instanceOf(leaked, FilePreviewFailed)
      assert.strictEqual(leaked.reason, "outside-workspace")
      assert.instanceOf(hostRoot, FilePreviewFailed)
      assert.strictEqual(hostRoot.reason, "outside-workspace")
    }),
  )

  it.effect("rejette un fichier absent", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      const missing = yield* readFilePreview({
        requestedPath: "missing.ts",
        workspaceRoot: yield* workspace(directory),
      }).pipe(Effect.flip)
      assert.instanceOf(missing, FilePreviewFailed)
      assert.strictEqual(missing.reason, "not-found")
    }),
  )

  it.effect("rattache /og-default.jpg au WorkspaceRoot au lieu de /", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      yield* fileSystem.writeFile(path.join(directory, "og-default.jpg"), PNG_1X1)

      const preview = yield* readFilePreview({
        requestedPath: "/og-default.jpg",
        workspaceRoot: yield* workspace(directory),
      })
      assert.strictEqual(preview.kind, "image")
    }),
  )

  it.effect("cherche un asset racine dans public/", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      yield* fileSystem.makeDirectory(path.join(directory, "public"))
      yield* fileSystem.writeFile(path.join(directory, "public", "og-default.jpg"), PNG_1X1)

      const preview = yield* readFilePreview({
        requestedPath: "/og-default.jpg",
        workspaceRoot: yield* workspace(directory),
      })
      assert.strictEqual(preview.kind, "image")
    }),
  )

  it.effect("sert un ICO", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-file-preview-",
      })
      yield* fileSystem.writeFile(
        path.join(directory, "favicon.ico"),
        Uint8Array.of(0x00, 0x00, 0x01, 0x00, 0x01),
      )

      const preview = yield* readFilePreview({
        requestedPath: "favicon.ico",
        workspaceRoot: yield* workspace(directory),
      })
      assert.strictEqual(preview.kind, "image")
      if (preview.kind === "image") {
        assert.strictEqual(preview.mime, "image/x-icon")
      }
    }),
  )

  it.effect("isPathInsideWorkspace refuse le préfixe collant", () =>
    Effect.gen(function* () {
      const pathApi = yield* Path.Path
      assert.isTrue(isPathInsideWorkspace("/tmp/proj/src/a.ts", "/tmp/proj", pathApi))
      assert.isFalse(isPathInsideWorkspace("/tmp/proj-evil/a.ts", "/tmp/proj", pathApi))
    }),
  )
})
