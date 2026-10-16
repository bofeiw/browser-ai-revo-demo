import { useState } from 'react'
import { Megaphone, Loader2, Download, RotateCcw } from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { useCampaignCreator } from './useCampaignCreator'
import { CAMPAIGN_EXAMPLES } from './prompt'
import { CAMPAIGN_FIELDS } from './types'
import { getMissingFields, validateCampaign } from './parseCampaign'
const fieldStyle = 'mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white focus:border-amber-400 focus:outline-none'
export default function CampaignCreator() {
  const {status,campaign,setCampaign,error,progress,generate,cancel} = useCampaignCreator()
  const [brief,setBrief] = useState('')
  const busy = status === 'loading' || status === 'generating'
  const issues = campaign ? validateCampaign(campaign) : []
  const missing = campaign ? getMissingFields(campaign) : []
  const download = () => {
    if (!campaign || issues.length) return
    const blob = new Blob([JSON.stringify({status:'draft',...campaign},null,2)],{type:'application/json'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href=url; link.download='campaign-draft.json'; link.click()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <FeaturePanel icon={Megaphone} title="Campaign Creator" description="用一句话描述投放需求，整理成一份可以继续修改的 campaign 草稿。">
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-gray-200" htmlFor="campaign-brief">这次想做什么推广？</label>
        <textarea id="campaign-brief" rows={4} value={brief} disabled={busy} onChange={event=>setBrief(event.target.value)} className={fieldStyle} placeholder="例如：为 Aurora App 推广注册，投放台湾，每天 USD 100，2026-10-19 至 2026-10-25，使用 Native 广告。" />
        <div className="mt-3 flex flex-wrap gap-2">{CAMPAIGN_EXAMPLES.map(example=><button type="button" disabled={busy} key={example.label} onClick={()=>setBrief(example.text)} className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-40">{example.label}</button>)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={()=>generate(brief)} disabled={busy||!brief.trim()} className="inline-flex items-center gap-2 rounded-lg bg-amber-300 px-5 py-3 font-semibold text-gray-950 disabled:opacity-40">{busy?<Loader2 className="size-4 animate-spin"/>:<Megaphone className="size-4"/>}{status==='loading'?'首次准备中…':status==='generating'?'正在整理…':'生成 Campaign 草稿'}</button>
        {busy && <button type="button" onClick={cancel} className="px-3 py-2 text-sm text-gray-300">停止</button>}
        {!busy && campaign && <button type="button" onClick={()=>{setCampaign(null);setBrief('')}} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-300"><RotateCcw className="size-4"/>重新开始</button>}
      </div>
      <div role="status" aria-live="polite">
        {status==='loading' && <p className="text-sm text-gray-400">首次使用需要下载准备文件，完成后可重复使用。{progress.filter(file=>file.total).length>0 && (()=>{const files=progress.filter(file=>file.total);const loaded=files.reduce((sum,file)=>sum+(file.loaded??0),0);const total=files.reduce((sum,file)=>sum+(file.total??0),0);return ` 下载进度 ${Math.min(100,Math.round(loaded/total*100))}%`})()}</p>}
        {status==='generating' && <p className="text-sm text-gray-400">正在从你的描述中提取投放信息，请稍候。</p>}
        {error && <div role="alert" className="rounded-lg bg-red-500/10 p-4 text-red-200"><p>未能完成生成，请检查网络连接或简化描述后重试。</p><details className="technical-details mt-2 text-xs"><summary>错误详情</summary>{error}</details></div>}
      </div>
      {campaign && <section aria-label="Campaign 草稿" className="space-y-5 border-t border-white/15 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-amber-300">Draft / 待确认</p><h3 className="mt-2 text-xl font-semibold">你的 Campaign 草稿</h3><p className="mt-1 text-sm text-gray-400">已对照原始描述检查；未明确提供的信息留空，请补充后确认。</p></div><button type="button" onClick={download} disabled={issues.length>0} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-sm disabled:opacity-40"><Download className="size-4"/>下载草稿</button></div>
        <div className="grid gap-5 sm:grid-cols-2">{CAMPAIGN_FIELDS.map(([key,label])=><label key={key} className="text-sm text-gray-300">{label}<input aria-label={label} type="text" value={campaign[key]} placeholder="待补充" className={fieldStyle} onChange={event=>setCampaign({...campaign,[key]:event.target.value})}/></label>)}<label className="text-sm text-gray-300">投放地区<input aria-label="投放地区" value={campaign.countries.join('、')} placeholder="待补充；多个地区用逗号分隔" className={fieldStyle} onChange={event=>setCampaign({...campaign,countries:event.target.value.split(/[,，、]/).map(value=>value.trim()).filter(Boolean)})}/></label></div>
        {issues.length>0 && <div role="alert" className="rounded-lg bg-red-500/10 p-4 text-sm text-red-200">{issues.map(issue=><p key={issue}>{issue}</p>)}</div>}
        {(missing.length>0 || campaign.missingInformation.length>0) && <div className="rounded-lg bg-amber-300/5 p-4 text-sm text-amber-100"><p className="font-semibold">还需要确认</p>{missing.length>0 && <p className="mt-2">待填写：{missing.join('、')}</p>}{campaign.missingInformation.map((question,index)=><p className="mt-1" key={index}>{question}</p>)}</div>}
      </section>}
    </div>
  </FeaturePanel>
}
