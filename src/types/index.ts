import type { LucideIcon } from 'lucide-react'

/** Unique identifier for each feature tab. */
export type FeatureId =
  | 'smart-ticket-creator'
  | 'campaign-creator'
  | 'semantic-search'
  | 'background-remover'

/** Browser technology a feature will eventually rely on. */
export type BrowserTech = 'Transformers.js' | 'WebGPU' | 'WebAssembly' | 'ONNX Runtime'

/**
 * Navigation metadata for a feature route. The route component itself is
 * lazy-loaded in the router config, so it is intentionally not referenced here.
 */
export interface Feature {
  /** Stable id used for keys. */
  id: FeatureId
  /** URL path for the feature (e.g. "/background-remover"). */
  path: string
  /** Short label shown in the tab bar. */
  label: string
  /** Human-readable title. */
  title: string
  /** One-line description of what the feature does. */
  description: string
  /** Icon rendered in the tab. */
  icon: LucideIcon
}
