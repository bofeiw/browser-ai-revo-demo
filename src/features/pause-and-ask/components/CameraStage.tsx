import type { RefObject } from 'react'
import { Camera, Pause, Play, Square, Snowflake } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { CameraState } from '../useCamera'
import type { CapturedFrame } from '../types'

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement | null>
  state: CameraState
  frame: CapturedFrame | null
  onStart: () => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  /** Disable pause/resume while an answer is generating. */
  controlsDisabled?: boolean
}

/**
 * The visual stage: a 16:9 surface that shows the live camera feed, or the
 * frozen frame while paused, plus the camera control buttons. The <video> is
 * always mounted (so the stream stays attached) and simply hidden behind the
 * frozen still while paused.
 */
export function CameraStage({
  videoRef,
  state,
  frame,
  onStart,
  onStop,
  onPause,
  onResume,
  controlsDisabled = false,
}: CameraStageProps) {
  const paused = state === 'paused'
  const live = state === 'live'
  const starting = state === 'starting'
  const active = live || paused || starting

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black/40">
        {/* Live video — always mounted so the MediaStream stays bound. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn(
            'size-full object-contain',
            paused && 'invisible', // hide behind the frozen still while paused
          )}
        />

        {/* Frozen still overlay while paused. */}
        {paused && frame && (
          <img
            src={frame.dataUrl}
            alt="Paused camera frame being analyzed"
            className="absolute inset-0 size-full object-contain"
          />
        )}

        {/* Idle empty state. */}
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-gray-500">
            <Camera className="size-10" aria-hidden="true" />
            <p className="text-sm">Camera is off</p>
            <p className="max-w-xs text-xs text-gray-600">
              Start the camera to preview your webcam. The video never leaves your device.
            </p>
          </div>
        )}

        {/* State badge. */}
        {active && (
          <div className="absolute left-2 top-2">
            {paused ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-200 backdrop-blur">
                <Snowflake className="size-3.5" aria-hidden="true" />
                Frame paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-0.5 text-xs font-medium text-rose-200 backdrop-blur">
                <span className="size-2 animate-pulse rounded-full bg-rose-400" aria-hidden="true" />
                {starting ? 'Starting…' : 'Live'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {!active ? (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Camera className="size-4" aria-hidden="true" />
            Start Camera
          </button>
        ) : (
          <>
            {live && (
              <button
                type="button"
                onClick={onPause}
                disabled={controlsDisabled || starting}
                className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
              >
                <Pause className="size-4" aria-hidden="true" />
                Pause Frame
              </button>
            )}
            {paused && (
              <button
                type="button"
                onClick={onResume}
                disabled={controlsDisabled}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
              >
                <Play className="size-4" aria-hidden="true" />
                Resume Camera
              </button>
            )}
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
            >
              <Square className="size-4" aria-hidden="true" />
              Stop Camera
            </button>
          </>
        )}
      </div>
    </div>
  )
}
