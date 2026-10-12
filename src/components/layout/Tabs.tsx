import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import type { Feature } from '../../types'

interface TabsProps {
  features: Feature[]
}

/**
 * Responsive, accessible tab-styled navigation. Each tab is a NavLink that
 * highlights itself when its route is active.
 */
export function Tabs({ features }: TabsProps) {
  return (
    <nav
      aria-label="AI features"
      className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-1"
    >
      {features.map((feature) => {
        const Icon = feature.icon
        return (
          <NavLink
            key={feature.id}
            to={feature.path}
            className={({ isActive }) =>
              cn(
                'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400',
                isActive
                  ? 'bg-indigo-500/15 text-white shadow-sm'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200',
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{feature.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
