import type { WorkspacePathEntry } from "@noyau/contracts/entities/workspace-path"
import { useLayoutEffect, useRef, useState } from "react"

import { PierreEntryIcon } from "@/components/PierreEntryIcon"
import { composerPathListCanScrollDown } from "@/lib/composer-path-menu"
import { basenameOfPath } from "@/lib/pierre-icons"

const directoryOfPath = (relativePath: string): string => {
  const separatorIndex = Math.max(relativePath.lastIndexOf("/"), relativePath.lastIndexOf("\\"))
  return separatorIndex >= 0 ? relativePath.slice(0, separatorIndex) : ""
}

export function ComposerPathMenu({
  entries,
  highlightedIndex,
  id,
  loading,
  onHighlight,
  onSelect,
}: {
  readonly entries: ReadonlyArray<WorkspacePathEntry>
  readonly highlightedIndex: number
  readonly id: string
  readonly loading: boolean
  readonly onHighlight: (index: number) => void
  readonly onSelect: (entry: WorkspacePathEntry) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const [fadeBottom, setFadeBottom] = useState(false)

  const syncFade = () => {
    const list = listRef.current
    if (list === null) {
      return
    }
    setFadeBottom(composerPathListCanScrollDown(list))
  }

  useLayoutEffect(() => {
    const list = listRef.current
    if (list === null) {
      return
    }
    syncFade()
    const observer = new ResizeObserver(syncFade)
    observer.observe(list)
    return () => {
      observer.disconnect()
    }
  }, [entries, loading])

  return (
    <div className="surface-glass absolute inset-x-6 bottom-full z-20 translate-y-px overflow-hidden rounded-t-xl border border-b-0">
      <ul
        ref={listRef}
        id={id}
        role="listbox"
        aria-label="Project files"
        className="max-h-56 overflow-y-auto px-1 pt-1 pb-2 text-sm"
        onScroll={syncFade}
      >
        {loading && entries.length === 0 ? (
          <li className="px-2 py-1.5 text-muted-foreground">Searching…</li>
        ) : null}
        {!loading && entries.length === 0 ? (
          <li className="px-2 py-1.5 text-muted-foreground">No files</li>
        ) : null}
        {entries.map((entry, index) => {
          const selected = index === highlightedIndex
          return (
            <li key={`${entry.kind}:${entry.path}`} role="presentation">
              <button
                type="button"
                id={`composer-path-option-${index}`}
                role="option"
                aria-selected={selected}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                  selected ? "bg-accent text-accent-foreground" : ""
                }`}
                onMouseEnter={() => {
                  onHighlight(index)
                }}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  onSelect(entry)
                }}
              >
                <PierreEntryIcon
                  pathValue={entry.path}
                  kind={entry.kind}
                  className="size-4 shrink-0"
                />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0">{basenameOfPath(entry.path)}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-muted-foreground text-xs">
                    {directoryOfPath(entry.path)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {fadeBottom ? (
        <div
          aria-hidden
          data-composer-path-fade
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-background/80 to-transparent"
        />
      ) : null}
    </div>
  )
}
