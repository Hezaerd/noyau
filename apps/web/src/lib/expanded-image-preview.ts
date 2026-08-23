export type ExpandedImageItem = {
  readonly src: string
  readonly name: string
}

export type ExpandedImagePreview = {
  readonly images: ReadonlyArray<ExpandedImageItem>
  readonly index: number
}

export const buildExpandedImagePreview = (
  images: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly previewUrl?: string | undefined
  }>,
  selectedImageId: string,
): ExpandedImagePreview | null => {
  const previewableImages = images.flatMap((image) =>
    image.previewUrl === undefined
      ? []
      : [{ id: image.id, src: image.previewUrl, name: image.name }],
  )
  if (previewableImages.length === 0) {
    return null
  }
  const selectedIndex = previewableImages.findIndex((image) => image.id === selectedImageId)
  if (selectedIndex < 0) {
    return null
  }
  return {
    images: previewableImages.map((image) => ({
      src: image.src,
      name: image.name,
    })),
    index: selectedIndex,
  }
}
