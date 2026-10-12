import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Card, CardContent } from '../ui/Card'

/** Simple fallback for unknown routes. */
export function NotFound() {
  return (
    <Card>
      <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 p-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400">
          <FileQuestion className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Page not found</h2>
          <p className="text-sm text-gray-400">
            That route doesn’t exist. Pick a feature to get started.
          </p>
        </div>
        <Link
          to="/ai-accessibility"
          className="mt-1 inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          Go to AI Accessibility
        </Link>
      </CardContent>
    </Card>
  )
}
