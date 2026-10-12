import { Search } from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { Placeholder } from '../../components/ui/Placeholder'

export function SemanticSearch() {
  return (
    <FeaturePanel
      icon={Search}
      title="Semantic Search"
      description="Search through local documents using semantic similarity."
    >
      <Placeholder
        label="Local document embeddings & similarity search"
        tech={['Transformers.js', 'WebAssembly', 'WebGPU']}
        willDemonstrate={[
          'Load a small set of local documents or snippets.',
          'A local embedding model turns each into a vector.',
          'Type a query and rank results by semantic similarity.',
          'Embeddings and search run entirely on-device.',
        ]}
      />
    </FeaturePanel>
  )
}

export default SemanticSearch
