import { cn } from "@/lib/utils"

export type ThemePreviewColors = {
  readonly canvas: string
  readonly sidebar: string
  readonly sidebarAccent: string
  readonly surface: string
  readonly muted: string
  readonly primary: string
}

const HAIRLINE = "rgb(127 127 127 / 0.22)"

const TABLEAU_COLUMN_DOTS = ["#6154e0", "#4d6ef0", "#2f9ab8"] as const

const COLUMN_TICKETS = [[0.92, 0.7], [0.84, 0.58], [0.76]] as const

export const NOYAU_THEME_PREVIEW_COLORS = {
  light: {
    canvas: "#f5f4fb",
    sidebar: "#ebe9f4",
    sidebarAccent: "#ddd8f2",
    surface: "#ffffff",
    muted: "#efedf6",
    primary: "#6154e0",
  },
  dark: {
    canvas: "#0f0f13",
    sidebar: "#0a0a0e",
    sidebarAccent: "#211f2b",
    surface: "#17171c",
    muted: "#202027",
    primary: "#9b8cff",
  },
} as const satisfies Record<"light" | "dark", ThemePreviewColors>

function ThemeWireframePane({
  colors,
  clip,
}: {
  readonly colors: ThemePreviewColors
  readonly clip?: "left" | "right" | undefined
}) {
  return (
    <span
      className="absolute inset-0"
      style={
        clip === undefined
          ? undefined
          : {
              clipPath:
                clip === "left"
                  ? "polygon(0 0, calc(50% - 1px) 0, calc(50% - 1px) 100%, 0 100%)"
                  : "polygon(calc(50% + 1px) 0, 100% 0, 100% 100%, calc(50% + 1px) 100%)",
            }
      }
    >
      <span className="absolute inset-0" style={{ backgroundColor: colors.canvas }} />
      <span
        className="absolute inset-y-0 left-0 w-[20%]"
        style={{ backgroundColor: colors.sidebar, boxShadow: `inset -1px 0 0 ${HAIRLINE}` }}
      />
      <span
        className="absolute top-[8%] left-[3%] size-[7%] rounded-md"
        style={{ backgroundColor: colors.primary }}
      />
      <span
        className="absolute top-[8%] left-[11.5%] h-[7%] w-[6%] rounded-sm"
        style={{ backgroundColor: colors.sidebarAccent }}
      />
      <span
        className="absolute top-[22%] left-[3%] h-[8%] w-[14%] rounded-md"
        style={{
          backgroundColor: colors.sidebarAccent,
          boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
        }}
      />
      <span
        className="absolute top-[36%] left-[3%] h-[7%] w-[14%] rounded-md"
        style={{ backgroundColor: colors.sidebarAccent }}
      />
      <span
        className="absolute top-[46%] left-[3%] h-[7%] w-[12%] rounded-md"
        style={{ backgroundColor: colors.muted, opacity: 0.85 }}
      />
      <span
        className="absolute top-[56%] left-[3%] h-[7%] w-[10%] rounded-md"
        style={{ backgroundColor: colors.muted, opacity: 0.55 }}
      />

      {TABLEAU_COLUMN_DOTS.map((dot, columnIndex) => {
        const left = 24 + columnIndex * 25
        const tickets = COLUMN_TICKETS[columnIndex] ?? []
        return (
          <span key={dot}>
            <span
              className="absolute top-[8%] h-[84%] w-[23%] rounded-md"
              style={{
                left: `${left}%`,
                backgroundColor: colors.surface,
                boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
              }}
            />
            <span
              className="absolute top-[11%] size-[4%] rounded-full"
              style={{ left: `${left + 1.4}%`, backgroundColor: dot }}
            />
            <span
              className="absolute top-[12%] h-[2.5%] w-[12%] rounded-sm"
              style={{ left: `${left + 6.5}%`, backgroundColor: HAIRLINE }}
            />
            {tickets.map((width, ticketIndex) => (
              <span
                key={`${dot}-${width}`}
                className="absolute rounded-sm"
                style={{
                  top: `${22 + ticketIndex * 22}%`,
                  left: `${left + 1.6}%`,
                  width: `${20 * width}%`,
                  height: "16%",
                  backgroundColor: colors.muted,
                  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
                }}
              />
            ))}
          </span>
        )
      })}
    </span>
  )
}

export function ThemeWireframe({
  className,
  panes,
}: {
  readonly className?: string
  readonly panes: ReadonlyArray<{
    readonly colors: ThemePreviewColors
    readonly clip?: "left" | "right" | undefined
  }>
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block w-full overflow-hidden rounded-lg border border-border/60",
        className,
      )}
    >
      {panes.map((pane) => (
        <ThemeWireframePane clip={pane.clip} colors={pane.colors} key={pane.clip ?? "pane"} />
      ))}
    </span>
  )
}
