import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RootLayout } from './components/layout/RootLayout'
import { NotFound } from './components/layout/NotFound'

// Lazy-load each feature page so its code (and any future on-demand AI model)
// is only fetched when the route is visited.
const ScreenshotBugReporter = lazy(
  () => import('./features/screenshot-bug-reporter/ScreenshotBugReporter'),
)
const AiAccessibility = lazy(() => import('./features/ai-accessibility/AiAccessibility'))
const SmartTicketCreator = lazy(
  () => import('./features/smart-ticket-creator/SmartTicketCreator'),
)
const PauseAndAsk = lazy(() => import('./features/pause-and-ask/PauseAndAsk'))
const SemanticSearch = lazy(() => import('./features/semantic-search/SemanticSearch'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // Redirect the index route to the first feature.
      { index: true, element: <Navigate to="/screenshot-bug-reporter" replace /> },
      { path: 'screenshot-bug-reporter', element: <ScreenshotBugReporter /> },
      { path: 'ai-accessibility', element: <AiAccessibility /> },
      { path: 'smart-ticket-creator', element: <SmartTicketCreator /> },
      { path: 'pause-and-ask', element: <PauseAndAsk /> },
      { path: 'semantic-search', element: <SemanticSearch /> },
      // Fallback for unknown routes (rendered inside the shared layout).
      { path: '*', element: <NotFound /> },
    ],
  },
])
