import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader } from './Card'

interface FeaturePanelProps {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
}

/** Consistent shell for a feature: header (icon + title + description) and body. */
export function FeaturePanel({ icon: Icon, title, description, children }: FeaturePanelProps) {
  return (
    <Card>
      <CardHeader className="border-b border-white/10">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-indigo-300">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="text-sm text-gray-400">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 sm:pt-6">{children}</CardContent>
    </Card>
  )
}
