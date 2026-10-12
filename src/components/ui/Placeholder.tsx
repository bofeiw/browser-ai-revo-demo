import type { ReactNode } from 'react'
import { Construction } from 'lucide-react'
import { Badge } from './Badge'
import type { BrowserTech } from '../../types'

interface PlaceholderProps {
  /** Short label describing the future interactive demo. */
  label: string
  /** Bullet points describing what the feature will eventually demonstrate. */
  willDemonstrate: string[]
  /** Browser technologies this feature will rely on. */
  tech: BrowserTech[]
  /** Optional custom icon/illustration slot for the demo area. */
  children?: ReactNode
}

/**
 * Shared placeholder shown inside every feature panel. Renders a clearly
 * labeled "coming soon" demo area plus an explanation of the future behavior.
 * No AI logic lives here — it is intentionally inert.
 */
export function Placeholder({ label, willDemonstrate, tech, children }: PlaceholderProps) {
  return (
    <div className="space-y-6">
      {/* Future interactive demo area */}
      <div
        className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/[0.015] p-8 text-center"
        role="status"
        aria-live="polite"
      >
        {children ?? (
          <span className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400">
            <Construction className="size-6" aria-hidden="true" />
          </span>
        )}
        <p className="text-sm font-medium text-gray-200">{label}</p>
        <p className="text-xs text-gray-500">
          Interactive demo coming in a future iteration.
        </p>
      </div>

      {/* What this will eventually demonstrate */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">
          What this will demonstrate
        </h3>
        <ul className="space-y-1.5 text-sm text-gray-400">
          {willDemonstrate.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-gray-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          {tech.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      </div>
    </div>
  )
}
