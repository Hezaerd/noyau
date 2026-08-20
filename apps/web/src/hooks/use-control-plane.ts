import { useContext } from "react"

import { ControlPlaneContext, type ControlPlaneContextValue } from "@/lib/control-plane-state"

export type { ControlPlaneContextValue }

export const useControlPlane = (): ControlPlaneContextValue => {
  const value = useContext(ControlPlaneContext)
  if (value === undefined) {
    throw new Error("useControlPlane must be used inside ControlPlaneProvider")
  }
  return value
}
