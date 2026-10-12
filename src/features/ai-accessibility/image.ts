/**
 * Image preprocessing utilities for the alt-text generator.
 *
 * Responsibilities:
 *  - Validate that an uploaded file is a supported image type (PNG/JPEG/WebP).
 *  - Downscale very large images before inference. Florence-2's processor
 *    resizes to 768×768 internally, so shrinking huge uploads up front just
 *    reduces peak memory and the cost of handing the bitmap to the worker.
 *  - Produce an object URL for previewing / passing to the model, with a
 *    matching revoke helper so callers can clean up allocations.
 *
 * This mirrors the Screenshot Bug Reporter's `image.ts` but is kept local to
 * the feature: the two features are independent and may diverge (e.g. accepted
 * types or max edge), and copying ~60 lines is cheaper than a shared image
 * abstraction that both features would have to agree on.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number]

/** Longest edge (px) we downscale images to before captioning. */
const MAX_EDGE = 1536

export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)
}

export interface PreparedImage {
  /** Object URL for the (possibly downscaled) image — revoke when done. */
  url: string
  width: number
  height: number
}

/**
 * Validate and (if needed) downscale an image file, returning an object URL.
 * Throws an Error with a user-facing message on unsupported or unreadable input.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!isAcceptedImage(file)) {
    throw new Error('Unsupported file type. Please use PNG, JPEG, or WebP.')
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Could not read this image. The file may be corrupted.')
  })

  try {
    const { width, height } = bitmap
    const longest = Math.max(width, height)

    // Small enough already: keep the original bytes (no re-encode).
    if (longest <= MAX_EDGE) {
      return { url: URL.createObjectURL(file), width, height }
    }

    const scale = MAX_EDGE / longest
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // Canvas unavailable — fall back to the original file.
      return { url: URL.createObjectURL(file), width, height }
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) {
      return { url: URL.createObjectURL(file), width, height }
    }
    return { url: URL.createObjectURL(blob), width: targetW, height: targetH }
  } finally {
    bitmap.close()
  }
}

/** Revoke an object URL created by {@link prepareImage}. Safe to call with "". */
export function releaseImage(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
