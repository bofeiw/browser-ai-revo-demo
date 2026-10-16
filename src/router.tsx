import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RootLayout } from './components/layout/RootLayout'
import { NotFound } from './components/layout/NotFound'

// Lazy-load each feature page so its code (and any future on-demand AI model)
// is only fetched when the route is visited.
const SmartTicketCreator = lazy(
  () => import('./features/smart-ticket-creator/SmartTicketCreator'),
)
const CampaignCreator = lazy(() => import('./features/campaign-creator/CampaignCreator'))
const SemanticSearch = lazy(() => import('./features/semantic-search/SemanticSearch'))
const BackgroundRemover = lazy(
  () => import('./features/background-remover/BackgroundRemover'),
)

export const router = createBrowserRouter(
  [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // Redirect the index route to the first feature.
      { index: true, element: <Navigate to="/background-remover" replace /> },
      { path: 'smart-ticket-creator', element: <SmartTicketCreator /> },
      { path: 'campaign-creator', element: <CampaignCreator /> },
      { path: 'semantic-search', element: <SemanticSearch /> },
      { path: 'background-remover', element: <BackgroundRemover /> },
      // Fallback for unknown routes (rendered inside the shared layout).
      { path: '*', element: <NotFound /> },
    ],
  },
  ],
  {
    // Vite injects BASE_URL ("/" in dev, "/practical-browser-ai/" on GitHub
    // Pages). react-router expects it without the trailing slash.
    basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  },
)
