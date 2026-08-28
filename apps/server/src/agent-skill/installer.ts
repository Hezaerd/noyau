import {
  AgentIntegrationFailed,
  type ProjectAgentIntegration,
} from "@noyau/contracts/agent-integration"
import type { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import type { ProjectId } from "@noyau/contracts/ids"
import { Context, Crypto, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"

import { NOYAU_AGENT_SKILL } from "./catalog.ts"

const MARKER_FILE = ".noyau-install.json"

const ManagedFile = Schema.Struct({
  path: Schema.NonEmptyString,
  sha256: Schema.NonEmptyString,
})

const ManagedSkillManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  skillName: Schema.Literal("noyau"),
  version: Schema.NonEmptyString,
  files: Schema.Array(ManagedFile),
})
type ManagedSkillManifest = (typeof ManagedSkillManifest)["Type"]

const ManifestJson = Schema.fromJsonString(ManagedSkillManifest)
const encoder = new TextEncoder()

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

const isInside = (candidate: string, root: string, path: Path.Path): boolean => {
  const normalizedRoot = path.normalize(root)
  const normalizedCandidate = path.normalize(candidate)
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  )
}

const portablePath = (value: string, path: Path.Path): string => value.split(path.sep).join("/")

const isSafeRelativePath = (value: string): boolean =>
  value !== "" &&
  !value.includes("\0") &&
  !value.startsWith("/") &&
  !value.startsWith("\\") &&
  !/^[A-Za-z]:/.test(value) &&
  value.split(/[\\/]/u).every((segment) => segment !== "" && segment !== "." && segment !== "..")

const status = (
  projectId: ProjectId,
  workspaceRoot: WorkspaceRoot,
  path: Path.Path,
  kind: ProjectAgentIntegration["status"],
  installedVersion?: string,
): ProjectAgentIntegration => {
  const base = {
    projectId,
    skillName: NOYAU_AGENT_SKILL.name,
    targetPath: path.join(workspaceRoot, ".agents", "skills", NOYAU_AGENT_SKILL.name),
    currentVersion: NOYAU_AGENT_SKILL.version,
    status: kind,
  } as const
  return installedVersion === undefined ? base : { ...base, installedVersion }
}

export interface AgentSkillInstallerService {
  readonly inspect: (
    projectId: ProjectId,
    workspaceRoot: WorkspaceRoot,
  ) => Effect.Effect<ProjectAgentIntegration>
  readonly install: (
    projectId: ProjectId,
    workspaceRoot: WorkspaceRoot,
  ) => Effect.Effect<ProjectAgentIntegration, AgentIntegrationFailed>
  readonly remove: (
    projectId: ProjectId,
    workspaceRoot: WorkspaceRoot,
  ) => Effect.Effect<ProjectAgentIntegration, AgentIntegrationFailed>
}

export class AgentSkillInstaller extends Context.Service<
  AgentSkillInstaller,
  AgentSkillInstallerService
>()("@noyau/server/AgentSkillInstaller") {}

export const unavailableAgentSkillInstallerLayer = Layer.succeed(AgentSkillInstaller)({
  inspect: () => Effect.die("Agent skill installer is unavailable in this layer"),
  install: () => Effect.die("Agent skill installer is unavailable in this layer"),
  remove: () => Effect.die("Agent skill installer is unavailable in this layer"),
})

export const agentSkillInstallerLayer = Layer.effect(
  AgentSkillInstaller,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const crypto = yield* Crypto.Crypto

    const digest = (content: string) =>
      crypto.digest("SHA-256", encoder.encode(content)).pipe(Effect.map(hex))

    const currentManifest = Effect.gen(function* () {
      const files = yield* Effect.forEach(NOYAU_AGENT_SKILL.files, (file) =>
        digest(file.content).pipe(Effect.map((sha256) => ({ path: file.path, sha256 }))),
      )
      return {
        schemaVersion: 1 as const,
        skillName: NOYAU_AGENT_SKILL.name,
        version: NOYAU_AGENT_SKILL.version,
        files,
      } satisfies ManagedSkillManifest
    })

    const readManifest = (target: string) =>
      fileSystem
        .readFileString(path.join(target, MARKER_FILE))
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ManifestJson)), Effect.option)

    const listFiles = Effect.fn("AgentSkillInstaller.listFiles")(function* (target: string) {
      const entries = yield* fileSystem.readDirectory(target, { recursive: true })
      const files: Array<string> = []
      for (const entry of entries) {
        const isFile = yield* fileSystem.stat(path.join(target, entry)).pipe(
          Effect.map((info) => info.type === "File"),
          Effect.orElseSucceed(() => false),
        )
        if (isFile) files.push(entry)
      }
      return files.map((entry) => portablePath(entry, path)).toSorted()
    })

    const matchesManifest = Effect.fn("AgentSkillInstaller.matchesManifest")(function* (
      target: string,
      manifest: ManagedSkillManifest,
    ) {
      if (
        manifest.files.some((file) => !isSafeRelativePath(file.path)) ||
        new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length
      ) {
        return false
      }
      const expectedFiles = [...manifest.files.map((file) => file.path), MARKER_FILE].toSorted()
      const actualFiles = yield* listFiles(target)
      if (
        expectedFiles.length !== actualFiles.length ||
        expectedFiles.some((file, index) => file !== actualFiles[index])
      ) {
        return false
      }
      const matches = yield* Effect.forEach(manifest.files, (file) =>
        fileSystem.readFileString(path.join(target, file.path)).pipe(
          Effect.flatMap(digest),
          Effect.map((actual) => actual === file.sha256),
        ),
      )
      return matches.every(Boolean)
    })

    const inspectUnsafe = Effect.fn("AgentSkillInstaller.inspect")(function* (
      projectId: ProjectId,
      workspaceRoot: WorkspaceRoot,
    ) {
      const target = path.join(workspaceRoot, ".agents", "skills", NOYAU_AGENT_SKILL.name)
      if (!(yield* fileSystem.exists(target))) {
        return status(projectId, workspaceRoot, path, "absent")
      }
      const rootReal = yield* fileSystem.realPath(workspaceRoot)
      const targetReal = yield* fileSystem.realPath(target)
      if (!isInside(targetReal, rootReal, path)) {
        return status(projectId, workspaceRoot, path, "conflict")
      }
      const targetInfo = yield* fileSystem.stat(targetReal)
      if (targetInfo.type !== "Directory") {
        return status(projectId, workspaceRoot, path, "conflict")
      }
      const manifestOption = yield* readManifest(targetReal)
      if (Option.isNone(manifestOption)) {
        return status(projectId, workspaceRoot, path, "conflict")
      }
      const manifest = manifestOption.value
      const filesMatchMarker = yield* matchesManifest(targetReal, manifest)
      if (!filesMatchMarker) {
        return status(projectId, workspaceRoot, path, "conflict", manifest.version)
      }
      const canonical = yield* currentManifest
      const markerIsCurrent =
        manifest.version === canonical.version &&
        manifest.files.length === canonical.files.length &&
        manifest.files.every((file, index) => {
          const expected = canonical.files[index]
          return (
            expected !== undefined && file.path === expected.path && file.sha256 === expected.sha256
          )
        })
      return status(
        projectId,
        workspaceRoot,
        path,
        markerIsCurrent ? "current" : "outdated",
        manifest.version,
      )
    })

    const inspect: AgentSkillInstallerService["inspect"] = (projectId, workspaceRoot) =>
      inspectUnsafe(projectId, workspaceRoot).pipe(
        Effect.orElseSucceed(() => status(projectId, workspaceRoot, path, "unavailable")),
      )

    const prepareParent = Effect.fn("AgentSkillInstaller.prepareParent")(function* (
      workspaceRoot: WorkspaceRoot,
    ) {
      const rootReal = yield* fileSystem
        .realPath(workspaceRoot)
        .pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" })))
      const parent = path.join(workspaceRoot, ".agents", "skills")
      yield* fileSystem
        .makeDirectory(parent, { recursive: true })
        .pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" })))
      const parentReal = yield* fileSystem
        .realPath(parent)
        .pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" })))
      if (!isInside(parentReal, rootReal, path)) {
        return yield* new AgentIntegrationFailed({ reason: "unsafe-path" })
      }
      return parentReal
    })

    const stageCurrent = Effect.fn("AgentSkillInstaller.stageCurrent")((parent: string) =>
      Effect.gen(function* () {
        const transaction = yield* fileSystem.makeTempDirectory({
          directory: parent,
          prefix: ".noyau-install-",
        })
        const staged = path.join(transaction, NOYAU_AGENT_SKILL.name)
        yield* fileSystem.makeDirectory(staged, { recursive: true })
        for (const file of NOYAU_AGENT_SKILL.files) {
          const destination = path.join(staged, file.path)
          yield* fileSystem.makeDirectory(path.dirname(destination), { recursive: true })
          yield* fileSystem.writeFileString(destination, file.content)
        }
        const manifest = yield* currentManifest
        const encoded = yield* Schema.encodeEffect(ManifestJson)(manifest)
        yield* fileSystem.writeFileString(path.join(staged, MARKER_FILE), encoded)
        return { transaction, staged }
      }).pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" }))),
    )

    const install: AgentSkillInstallerService["install"] = Effect.fn("AgentSkillInstaller.install")(
      function* (projectId, workspaceRoot) {
        const before = yield* inspect(projectId, workspaceRoot)
        if (before.status === "current") {
          return before
        }
        if (before.status === "conflict") {
          return yield* new AgentIntegrationFailed({ reason: "conflict" })
        }
        if (before.status === "unavailable") {
          return yield* new AgentIntegrationFailed({ reason: "unavailable" })
        }
        const parent = yield* prepareParent(workspaceRoot)
        const target = path.join(parent, NOYAU_AGENT_SKILL.name)
        const staged = yield* stageCurrent(parent)
        const cleanup = fileSystem
          .remove(staged.transaction, { recursive: true, force: true })
          .pipe(Effect.orElseSucceed(() => undefined))
        return yield* Effect.gen(function* () {
          if (before.status === "absent") {
            yield* fileSystem
              .rename(staged.staged, target)
              .pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "conflict" })))
          } else {
            const confirmed = yield* inspect(projectId, workspaceRoot)
            if (confirmed.status === "current") return confirmed
            if (confirmed.status !== "outdated") {
              return yield* new AgentIntegrationFailed({
                reason: confirmed.status === "unavailable" ? "unavailable" : "conflict",
              })
            }
            const backup = path.join(staged.transaction, "previous")
            yield* fileSystem
              .rename(target, backup)
              .pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" })))
            yield* fileSystem.rename(staged.staged, target).pipe(
              Effect.tapError(() => fileSystem.rename(backup, target).pipe(Effect.orDie)),
              Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" })),
            )
          }
          return yield* inspect(projectId, workspaceRoot)
        }).pipe(Effect.ensuring(cleanup))
      },
    )

    const remove: AgentSkillInstallerService["remove"] = Effect.fn("AgentSkillInstaller.remove")(
      function* (projectId, workspaceRoot) {
        const before = yield* inspect(projectId, workspaceRoot)
        if (before.status === "absent") {
          return before
        }
        if (before.status === "conflict") {
          return yield* new AgentIntegrationFailed({ reason: "conflict" })
        }
        if (before.status === "unavailable") {
          return yield* new AgentIntegrationFailed({ reason: "unavailable" })
        }
        const parent = yield* prepareParent(workspaceRoot)
        const target = path.join(parent, NOYAU_AGENT_SKILL.name)
        const transaction = yield* fileSystem
          .makeTempDirectory({ directory: parent, prefix: ".noyau-remove-" })
          .pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" })))
        yield* fileSystem
          .rename(target, path.join(transaction, NOYAU_AGENT_SKILL.name))
          .pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" })))
        yield* fileSystem
          .remove(transaction, { recursive: true, force: true })
          .pipe(Effect.mapError(() => new AgentIntegrationFailed({ reason: "unavailable" })))
        return status(projectId, workspaceRoot, path, "absent")
      },
    )

    return AgentSkillInstaller.of({ inspect, install, remove })
  }),
)
