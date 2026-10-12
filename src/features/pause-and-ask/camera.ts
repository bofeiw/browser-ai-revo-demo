/**
 * Camera + frame-capture utilities for Pause & Ask.
 *
 * These helpers are deliberately framework-agnostic (no React) so the camera
 * lifecycle can be reasoned about and tested independently of the UI. The
 * React hook (useCamera) owns *when* these run; this module owns *how*.
 *
 * Nothing here ever uploads data: frames are captured to an in-memory canvas
 * and encoded to a local data URL.
 */

import type { CapturedFrame } from './types'

/** Longest edge (px) a captured frame is downscaled to before inference. */
const MAX_CAPTURE_EDGE = 768

/** Human-friendly messages for the common getUserMedia failure modes. */
export function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Camera permission was denied. Allow camera access in your browser and try again.'
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No camera was found. Connect a webcam and try again.'
      case 'NotReadableError':
        return 'The camera is already in use by another application.'
      case 'AbortError':
        return 'Camera start was interrupted. Please try again.'
      default:
        return err.message || 'Could not start the camera.'
    }
  }
  if (err instanceof Error) return err.message
  return 'Could not start the camera.'
}

/** True when the MediaDevices camera API is available in this context. */
export function isCameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

/**
 * Request the webcam and return its MediaStream. Permission is only requested
 * when this is called — i.e. when the user clicks "Start Camera".
 *
 * Throws an Error with a user-facing message (via {@link describeCameraError})
 * on denial / missing hardware.
 */
export async function startCameraStream(): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new Error('This browser does not support camera access (MediaDevices API).')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
  } catch (err) {
    throw new Error(describeCameraError(err))
  }
}

/** Stop every track on a stream, releasing the camera hardware. Safe on null. */
export function stopCameraStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

/**
 * Capture the current frame of a playing <video> element to a data URL,
 * downscaling so the longest edge is at most {@link MAX_CAPTURE_EDGE}. The VLM
 * resizes internally anyway, so a smaller frame cuts encode cost and the amount
 * of data copied to the worker without hurting answer quality.
 *
 * Returns null if the video has no frame yet (dimensions are still 0).
 */
export function captureFrame(video: HTMLVideoElement, id: number): CapturedFrame | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const longest = Math.max(vw, vh)
  const scale = longest > MAX_CAPTURE_EDGE ? MAX_CAPTURE_EDGE / longest : 1
  const width = Math.round(vw * scale)
  const height = Math.round(vh * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, width, height)
  // JPEG keeps the data URL small; quality 0.9 is plenty for scene understanding.
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)

  // Release the canvas backing store promptly.
  canvas.width = 0
  canvas.height = 0

  return { dataUrl, width, height, id }
}
