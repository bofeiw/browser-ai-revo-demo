import { Video } from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { Placeholder } from '../../components/ui/Placeholder'

export function PauseAndAsk() {
  return (
    <FeaturePanel
      icon={Video}
      title="Pause & Ask"
      description="Analyze a live camera feed, pause on a frame, and ask questions about its content."
    >
      <Placeholder
        label="Live camera capture & visual Q&A"
        tech={['Transformers.js', 'WebGPU']}
        willDemonstrate={[
          'Start a live camera feed directly in the browser.',
          'Pause on any frame to freeze the current view.',
          'Ask natural-language questions about what is in the frame.',
          'A local vision-language model answers without uploading video.',
        ]}
      />
    </FeaturePanel>
  )
}

export default PauseAndAsk
