/**
 * Alpha-mask compositing + transparent-PNG export.
 *
 * The worker returns a single-channel foreground alpha matte already resized to
 * the original image dimensions (see {@link AlphaMask}). This module applies
 * that matte to the *original* orientation-corrected pixels and produces a PNG
 * blob with a genuine alpha channel.
 *
 * Why composite here (main thread) instead of in the worker:
 *  - We need to draw the original image, which is cheapest from the same object
 *    URL the UI already holds (no second decode/transfer of full-res RGBA).
 *  - `canvas.toBlob('image/png')` preserves the alpha channel natively, so no
 *    extra image-processing dependency is required.
 *
 * Correctness notes:
 *  - The mask is multiplied into the existing alpha channel per pixel, so we
 *    never replace transparency with white — background pixels become fully
 *    transparent (RGBA alpha = 0), foreground keeps its original colour.
 *  - The matte is produced at the original resolution and the original image is
 *    drawn at its native size, so proportions are preserved exactly (no stretch).
 *  - RMBG emits soft edges (0–255), which we keep verbatim for smooth, non-jagged
 *    cut-outs rather than hard-thresholding to 0/255.
 */

import type { AlphaMask } from './types'

/** A finished cut-out: a transparent-PNG blob plus its object URL and size. */
export interface Cutout {
  blob: Blob
  /** Object URL for the PNG — revoke when no longer displayed. */
  url: string
  width: number
  height: number
}

/** Load an image element from a URL (used to draw the original pixels). */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the processed image.'))
    img.src = url
  })
}

/**
 * Composite `mask` onto the original image at `imageUrl` and return a
 * transparent PNG. The mask must already match the original dimensions.
 */
export async function composeCutout(imageUrl: string, mask: AlphaMask): Promise<Cutout> {
  const img = await loadImage(imageUrl)

  // Draw the original pixels at the mask's (original) resolution. If the loaded
  // image somehow differs from the mask size, drawImage scales it to match so
  // the two buffers always align pixel-for-pixel.
  const width = mask.width
  const height = mask.height

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser.')

  ctx.drawImage(img, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, width, height)
  const pixels = imageData.data // RGBA, length = width*height*4
  const alpha = mask.data // length = width*height

  // Multiply the predicted foreground alpha into the existing alpha channel.
  // (Most source images are opaque, so this is effectively "set alpha", but
  // multiplying is correct for sources that already have transparency.)
  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) {
    pixels[p] = (pixels[p] * alpha[i]) / 255
  }

  ctx.putImageData(imageData, 0, 0)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('Could not encode the transparent PNG.')

  return { blob, url: URL.createObjectURL(blob), width, height }
}

/** Revoke a cut-out's object URL. Safe to call with null/undefined. */
export function releaseCutout(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

/**
 * Trigger a browser download of a blob as `filename`. Creates and revokes a
 * temporary object URL so nothing leaks.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Derive a sensible "<name>-no-bg.png" download name from the source file. */
export function cutoutFilename(sourceName: string | null | undefined): string {
  const base = (sourceName ?? 'image').replace(/\.[^.]+$/, '').trim() || 'image'
  return `${base}-no-bg.png`
}
