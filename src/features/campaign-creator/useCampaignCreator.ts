import { useCallback, useEffect, useRef, useState } from 'react'
import type { Campaign } from './types'
import type { ModelFileProgress, WorkerResponse } from '../smart-ticket-creator/types'
export function useCampaignCreator() {
  const workerRef = useRef<Worker | null>(null)
  const [status, setStatus] = useState<'idle'|'loading'|'generating'|'done'|'error'>('idle')
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<ModelFileProgress[]>([])
  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    // Both creators use the exact same model, worker, generation loop and cache.
    const worker = new Worker(new URL('../smart-ticket-creator/worker.ts', import.meta.url), {type:'module'})
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const data = event.data
      if (data.status === 'loading') setStatus('loading')
      if (data.status === 'progress') setProgress(previous => [...previous.filter(file => file.file !== data.file.file), data.file])
      if (data.status === 'generating') setStatus('generating')
      if (data.status === 'campaign-complete') { setCampaign(data.campaign); setStatus('done') }
      if (data.status === 'error') { setError(data.message); setStatus('error') }
    })
    worker.addEventListener('error', () => { setError('运行中断，请刷新页面后重试。'); setStatus('error') })
    workerRef.current = worker
    return worker
  }, [])
  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null }, [])
  const generate = useCallback((brief: string) => {
    if (!brief.trim()) return
    setCampaign(null); setError(''); setProgress([]); setStatus('loading')
    ensureWorker().postMessage({type:'generate', task:'campaign', complaint:brief})
  }, [ensureWorker])
  const cancel = useCallback(() => {
    // Termination also cancels a first-time download, not just token generation.
    workerRef.current?.terminate(); workerRef.current = null
    setStatus('idle'); setError(''); setProgress([])
  }, [])
  return {status,campaign,setCampaign,error,progress,generate,cancel}
}
