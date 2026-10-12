import { Bug, Accessibility, Ticket, Video, Search } from 'lucide-react'
import type { Feature } from '../types'

/**
 * Single source of truth for the five feature tabs. Holds navigation metadata
 * only — route components are lazy-loaded in the router config so no feature
 * code (or future AI model) is pulled in until its route is visited.
 */
export const features: Feature[] = [
  {
    id: 'screenshot-bug-reporter',
    path: '/screenshot-bug-reporter',
    label: 'Bug Reporter',
    title: 'Screenshot Bug Reporter',
    description: 'Upload a screenshot and generate a structured bug report.',
    icon: Bug,
  },
  {
    id: 'ai-accessibility',
    path: '/ai-accessibility',
    label: 'Accessibility',
    title: 'AI Accessibility',
    description: 'Upload an image and generate accessible alt text.',
    icon: Accessibility,
  },
  {
    id: 'smart-ticket-creator',
    path: '/smart-ticket-creator',
    label: 'Ticket Creator',
    title: 'Smart Ticket Creator',
    description: 'Convert unstructured natural language into a structured issue ticket.',
    icon: Ticket,
  },
  {
    id: 'pause-and-ask',
    path: '/pause-and-ask',
    label: 'Pause & Ask',
    title: 'Pause & Ask',
    description: 'Analyze a live camera feed, pause on a frame, and ask about its content.',
    icon: Video,
  },
  {
    id: 'semantic-search',
    path: '/semantic-search',
    label: 'Semantic Search',
    title: 'Semantic Search',
    description: 'Search through local documents using semantic similarity.',
    icon: Search,
  },
]
