/**
 * React hook that owns the webcam lifecycle for Pause & Ask.
 *
 * Responsibilities:
 *  - Start / stop the MediaStream (permission requested only on start()).
 *  - Attach the stream to a <video> element the caller provides via `videoRef`.
 *  - Pause on the current frame (capture to a data URL) and resume.
 *  - Release camera tracks on stop and on unmount, and drop the captured frame.
 *
 * It deliberately does no model work — that lives in useVqa. The two hooks are
 * composed by the page component.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CapturedFrame } from './types'
import {
  captureFrame,
  isCameraSupported,
  startCameraStream,
  stopCameraStream,
} from './camera'

export type CameraState = 'idle' | 'starting' | 'live' | 'paused'

export interface UseCamera {
  /** Attach this to the <video> element that shows the live preview. */
  videoRef: RefObject<HTMLVideoElement | null>
  state: CameraState
  /** Whether the MediaDevices camera API exists in this browser. */
  supported: boolean
  /** The frozen frame while paused (null when live or idle). */
  frame: CapturedFrame | null
  error: string | null
  start: () => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
}

export function useCamera(): UseCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameIdRef = useRef(0)

  const [state, setState] = useState<CameraState>('idle')
  const [frame, setFrame] = useState<CapturedFrame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const supported = isCameraSupported()

  /** Release the hardware and reset to idle. Used by stop() and on unmount. */
  const releaseStream = useCallback(() => {
    stopCameraStream(streamRef.current)
    streamRef.current = null
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return // already running
    setError(null)
    setState('starting')
    try {
      const stream = await startCameraStream()
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        // Component unmounted mid-request — don't leak the stream.
        stopCameraStream(stream)
        streamRef.current = null
        setState('idle')
        return
      }
      video.srcObject = stream
      await video.play().catch(() => {
        /* autoplay can reject; the stream is still attached and visible */
      })
      setFrame(null)
      setState('live')
    } catch (err) {
      releaseStream()
      setError(err instanceof Error ? err.message : 'Could not start the camera.')
      setState('idle')
    }
  }, [releaseStream])

  const stop = useCallback(() => {
    releaseStream()
    setFrame(null)
    setError(null)
    setState('idle')
  }, [releaseStream])

  const pause = useCallback(() => {
    const video = videoRef.current
    if (!video || !streamRef.current) return
    const captured = captureFrame(video, ++frameIdRef.current)
    if (!captured) {
      setError('Could not capture a frame yet. Give the camera a moment and try again.')
      return
    }
    // Freeze the preview element too, so the paused state is unmistakable.
    video.pause()
    setFrame(captured)
    setState('paused')
  }, [])

  const resume = useCallback(() => {
    const video = videoRef.current
    if (!video || !streamRef.current) {
      // Stream was lost; fall back to idle so the user can restart cleanly.
      setFrame(null)
      setState('idle')
      return
    }
    setFrame(null)
    void video.play().catch(() => {})
    setState('live')
  }, [])

  // Release the camera when the component unmounts (e.g. navigating away).
  useEffect(() => {
    return () => {
      stopCameraStream(streamRef.current)
      streamRef.current = null
    }
  }, [])

  return { videoRef, state, supported, frame, error, start, stop, pause, resume }
}
