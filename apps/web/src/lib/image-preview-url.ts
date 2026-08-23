export const createImagePreviewUrl = (bytes: Uint8Array, mime: string): string => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return URL.createObjectURL(new Blob([copy], { type: mime }))
}
