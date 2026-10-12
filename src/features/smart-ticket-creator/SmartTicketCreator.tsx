import { Ticket } from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { Placeholder } from '../../components/ui/Placeholder'

export function SmartTicketCreator() {
  return (
    <FeaturePanel
      icon={Ticket}
      title="Smart Ticket Creator"
      description="Convert unstructured natural language into a structured issue ticket."
    >
      <Placeholder
        label="Freeform text → structured ticket"
        tech={['Transformers.js', 'WebAssembly']}
        willDemonstrate={[
          'Paste a rough description of a problem or request.',
          'A local language model extracts the key details.',
          'Outputs a structured ticket: summary, type, priority, labels.',
          'All parsing happens in-browser with no server round-trip.',
        ]}
      />
    </FeaturePanel>
  )
}

export default SmartTicketCreator
