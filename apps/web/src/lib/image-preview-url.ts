export const createImagePreviewUrl = (bytes: Uint8Array, mime: string): string => {
  const blobBytes =
    bytes.buffer instanceof ArrayBuffer
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new Uint8Array(bytes)
  return URL.createObjectURL(new Blob([blobBytes], { type: mime }))
}
