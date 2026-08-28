import type { ThreadId, TurnId } from "@noyau/contracts/ids"
import { FileDiff, PatchDiff } from "@pierre/diffs/react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { useAppearance } from "@/hooks/use-appearance"
import { useMediaQuery } from "@/hooks/use-media-query"
import { resolveAppearance } from "@/lib/appearance"
import { getTurnDiff } from "@/lib/control-plane"
import { fileDiffPath, parseTurnDiffPatch, resolveDiffThemeName } from "@/lib/turn-diff-patch"

export type ThreadTurnDiffTarget = {
  readonly threadId: ThreadId
  readonly turnId: TurnId
  readonly filePath?: string
}

export function ThreadTurnDiffPanel({
  target,
  onClose,
}: {
  readonly target: ThreadTurnDiffTarget | null
  readonly onClose: () => void
}) {
  const { preference } = useAppearance()
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)")
  const theme = resolveDiffThemeName(resolveAppearance(preference, systemDark))
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true)
  const [patch, setPatch] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const selectedRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (target === null) {
      setPatch(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setPatch(null)
    void (async () => {
      const result = await getTurnDiff({
        threadId: target.threadId,
        turnId: target.turnId,
        ignoreWhitespace,
      })
      if (cancelled) {
        return
      }
      setLoading(false)
      if (result.ok) {
        setPatch(result.value.patch)
        return
      }
      setPatch(null)
      setError(
        result.failure._tag === "InvalidInput" && result.failure.message !== undefined
          ? result.failure.message
          : "Impossible de charger le patch de ce Turn.",
      )
    })()
    return () => {
      cancelled = true
    }
  }, [ignoreWhitespace, target])

  const files = useMemo(() => (patch === null ? [] : parseTurnDiffPatch(patch)), [patch])

  useEffect(() => {
    if (target?.filePath === undefined || files.length === 0) {
      return
    }
    selectedRef.current?.scrollIntoView({ block: "start" })
  }, [files, target?.filePath])

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <SheetPopup side="right" className="max-w-3xl sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Fichiers du Turn</SheetTitle>
          <SheetDescription>Patch recalculé depuis les Checkpoints, hors journal.</SheetDescription>
          <label className="flex items-center gap-2 text-muted-foreground text-xs">
            <Switch checked={ignoreWhitespace} onCheckedChange={setIgnoreWhitespace} />
            Ignorer les espaces
          </label>
        </SheetHeader>
        <SheetPanel className="min-h-0">
          {loading ? <p className="text-muted-foreground text-sm">Chargement du patch…</p> : null}
          {error === null ? null : <p className="text-destructive text-sm">{error}</p>}
          {!loading && error === null && (patch === null || patch.trim() === "") ? (
            <p className="text-muted-foreground text-sm">Aucun hunk à afficher.</p>
          ) : null}
          {files.length > 0 ? (
            files.map((file) => {
              const path = fileDiffPath(file)
              const selected = target?.filePath === path
              return (
                <div key={path} ref={selected ? selectedRef : undefined} className="mb-4 min-w-0">
                  <FileDiff
                    fileDiff={file}
                    disableWorkerPool
                    options={{
                      collapsed: false,
                      diffStyle: "unified",
                      theme,
                    }}
                  />
                </div>
              )
            })
          ) : patch !== null && patch.trim() !== "" && !loading && error === null ? (
            <PatchDiff
              patch={patch}
              disableWorkerPool
              options={{
                collapsed: false,
                diffStyle: "unified",
                theme,
              }}
            />
          ) : null}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  )
}
