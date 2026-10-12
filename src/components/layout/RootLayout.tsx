import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Header } from './Header'
import { Footer } from './Footer'
import { Tabs } from './Tabs'
import { features } from '../../features/registry'

/** Lightweight fallback shown while a lazy feature route loads. */
function RouteFallback() {
  return (
    <div
      className="flex min-h-56 items-center justify-center gap-2 text-sm text-gray-500"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading feature…
    </div>
  )
}

/**
 * Shared application shell: header, tab navigation, and the active feature
 * route rendered through an Outlet. Lazy routes stream in under Suspense.
 */
export function RootLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Tabs features={features} />
        <div className="mt-6">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <Footer />
    </div>
  )
}
