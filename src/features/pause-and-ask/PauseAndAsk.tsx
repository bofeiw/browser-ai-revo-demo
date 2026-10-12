import { useCallback, useEffect, useRef, useState } from 'react'
import { Video, Sparkles, Loader2, X, MessageCircleQuestion } from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { CameraStage } from './components/CameraStage'
import { ModelStatus } from './components/ModelStatus'
import { captureFrame } from './camera'
import { useCamera } from './useCamera'
import { useVqa } from './useVqa'

/** How often the live-description loop re-captions, measured between completions. */
const CAPTION_INTERVAL_MS = 2500

const EXAMPLE_QUESTIONS = [
  'What objects are visible?',
  'What color is the object in the center?',
  'How many people are in the frame?',
  'Describe what is happening in this image.',
]

export function PauseAndAsk() {
  const camera = useCamera()
  const vqa = useVqa()

  const [question, setQuestion] = useState('')
  const [liveDescribe, setLiveDescribe] = useState(false)
  const [liveCaption, setLiveCaption] = useState<string | null>(null)

  const busy = vqa.status === 'loading-model' || vqa.status === 'generating'
  const isPaused = camera.state === 'paused'
  const isLive = camera.state === 'live'

  // ---- Live AI Description loop -----------------------------------------
  // Completion-based scheduling: we only ever have one caption in flight, and
  // the next is scheduled a fixed delay *after* the previous one finishes. This
  // guarantees no unbounded queue of inference requests. The loop runs only
  // while live (never while paused / answering a question).
  const liveActiveRef = useRef(false)
  useEffect(() => {
    const shouldRun = liveDescribe && isLive && camera.supported
    liveActiveRef.current = shouldRun
    if (!shouldRun) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const tick = async () => {
      if (cancelled || !liveActiveRef.current) return
      const video = camera.videoRef.current
      if (!video) return
      // Capture the current frame directly (don't disturb camera state).
      const frame = captureFrame(video, Date.now())
      if (!frame || cancelled || !liveActiveRef.current) return
      const text = await vqa.caption(frame.dataUrl)
      if (cancelled || !liveActiveRef.current) return
      if (text) setLiveCaption(text)
      // Schedule the next pass only after this one resolved.
      timer = setTimeout(() => void tick(), CAPTION_INTERVAL_MS)
    }

    void tick()

    return () => {
      cancelled = true
      liveActiveRef.current = false
      if (timer) clearTimeout(timer)
    }
    // camera.videoRef is stable; vqa.caption is stable (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDescribe, isLive, camera.supported])

  // Clear the stale caption whenever we leave live mode or disable the toggle.
  useEffect(() => {
    if (!liveDescribe || !isLive) setLiveCaption(null)
  }, [liveDescribe, isLive])

  const handleAsk = useCallback(() => {
    if (!camera.frame || !question.trim() || busy) return
    vqa.ask(camera.frame.dataUrl, question.trim())
  }, [busy, camera.frame, question, vqa])

  const handleResume = useCallback(() => {
    vqa.reset()
    camera.resume()
  }, [camera, vqa])

  // If the user stops the camera mid-answer, interrupt the model too.
  useEffect(() => {
    if (camera.state === 'idle' && busy) vqa.interrupt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.state])

  const showStatus = busy || vqa.support.checked

  return (
    <FeaturePanel
      icon={Video}
      title="Pause & Ask"
      description="Start your webcam, pause on a frame, and ask a local vision model about it — the video never leaves your device."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge>LFM2.5-VL-450M</Badge>
          <Badge>Transformers.js v4</Badge>
          <Badge>WebGPU</Badge>
          <Badge>100% on-device</Badge>
        </div>

        {!camera.supported && (
          <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            This browser doesn&apos;t support camera access (MediaDevices API). Try a recent
            Chromium-based desktop browser over HTTPS or localhost.
          </p>
        )}

        {/* Camera preview + controls */}
        <CameraStage
          videoRef={camera.videoRef}
          state={camera.state}
          frame={camera.frame}
          onStart={camera.start}
          onStop={camera.stop}
          onPause={camera.pause}
          onResume={handleResume}
          controlsDisabled={busy}
        />

        {camera.error && (
          <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {camera.error}
          </p>
        )}

        {/* Live AI Description toggle (only meaningful while live) */}
        {(isLive || liveDescribe) && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-gray-200">
                  Live AI Description
                </span>
                <span className="block text-xs text-gray-500">
                  Periodically describe the live scene (pauses automatically while you ask
                  about a frozen frame).
                </span>
              </span>
              <input
                type="checkbox"
                checked={liveDescribe}
                onChange={(e) => setLiveDescribe(e.target.checked)}
                className="size-4 shrink-0 accent-indigo-500"
              />
            </label>
            {liveDescribe && (
              <p className="min-h-[1.5rem] rounded-md border border-white/5 bg-black/30 px-3 py-2 text-sm text-gray-300">
                {liveCaption ? (
                  liveCaption
                ) : (
                  <span className="inline-flex items-center gap-2 text-gray-500">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    Describing the scene…
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* Ask-about-this-frame panel (only when paused) */}
        {isPaused && (
          <div className="space-y-3 border-t border-white/10 pt-6">
            <div className="space-y-1.5">
              <label htmlFor="pa-question" className="block text-sm font-medium text-gray-300">
                Ask about this frame
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="pa-question"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAsk()
                  }}
                  disabled={busy}
                  placeholder="e.g. What objects are visible?"
                  className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleAsk}
                  disabled={!question.trim() || busy}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                    'bg-indigo-500 text-white hover:bg-indigo-400',
                    'disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500',
                  )}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="size-4" aria-hidden="true" />
                  )}
                  {vqa.status === 'loading-model'
                    ? 'Loading…'
                    : vqa.status === 'generating'
                      ? 'Thinking…'
                      : 'Ask AI'}
                </button>
                {busy && (
                  <button
                    type="button"
                    onClick={vqa.interrupt}
                    className="inline-flex shrink-0 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
                  >
                    <X className="size-4" aria-hidden="true" />
                    Stop
                  </button>
                )}
              </div>
            </div>

            {/* Example question chips */}
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={busy}
                  onClick={() => setQuestion(q)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-500">
              You can ask as many questions as you like about this frozen frame. Resume the
              camera when you want a new one.
            </p>
          </div>
        )}

        {/* Model status / download progress */}
        {showStatus && (
          <ModelStatus
            status={vqa.status}
            support={vqa.support}
            device={vqa.device}
            progress={vqa.progress}
          />
        )}

        {/* Streamed / final answer */}
        {isPaused && (vqa.streamedText || vqa.answer) && vqa.status !== 'error' && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <MessageCircleQuestion className="size-4" aria-hidden="true" />
              Answer
            </p>
            <div className="rounded-md border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-gray-100">
              {vqa.streamedText || vqa.answer}
              {vqa.status === 'generating' && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400 align-middle" />
              )}
            </div>
            <p className="text-xs text-gray-500">
              Generated locally from the paused frame. The model can be wrong — treat answers
              as a starting point.
            </p>
          </div>
        )}

        {/* Inference error */}
        {vqa.status === 'error' && vqa.error && (
          <div className="space-y-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-200">
            <p className="font-medium">Could not generate an answer</p>
            <p className="text-rose-300/90">{vqa.error}</p>
            <p className="text-xs text-rose-300/70">
              This can happen if the browser lacks WebGPU and has too little memory for the
              CPU fallback. Try a Chromium-based desktop browser with WebGPU enabled.
            </p>
          </div>
        )}
      </div>
    </FeaturePanel>
  )
}

export default PauseAndAsk
