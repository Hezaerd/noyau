import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
  SpinnerIcon,
} from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    // Sonner's optional props are not spread-compatible with exactOptionalPropertyTypes.
    // @ts-expect-error -- upstream component typing
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon strokeWidth={2} className="size-4" />,
        info: <InfoIcon strokeWidth={2} className="size-4" />,
        warning: <WarningIcon strokeWidth={2} className="size-4" />,
        error: <XCircleIcon strokeWidth={2} className="size-4" />,
        loading: <SpinnerIcon strokeWidth={2} className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
