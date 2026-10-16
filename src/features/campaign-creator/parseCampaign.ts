import { extractJsonObject, isDegenerateLoop } from '../smart-ticket-creator/parseTicket'
import { CAMPAIGN_FIELDS, type Campaign } from './types'
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const list = (value: unknown): string[] => [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))]
export function parseCampaign(raw: string): { ok: true; campaign: Campaign } | { ok: false; reason: string } {
  if (isDegenerateLoop(raw)) return { ok: false, reason: '生成内容重复，请重试或简化描述。' }
  const json = extractJsonObject(raw)
  if (!json) return { ok: false, reason: '未能整理出完整草稿，请重试。' }
  try {
    const value: unknown = JSON.parse(json.replace(/,\s*([}\]])/g, '$1'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    const data = value as Record<string, unknown>
    const campaign: Campaign = {
      name: text(data.name), product: text(data.product), objective: text(data.objective),
      countries: list(data.countries), dailyBudget: text(data.dailyBudget),
      startDate: text(data.startDate), endDate: text(data.endDate), adFormat: text(data.adFormat),
      missingInformation: list(data.missingInformation),
    }
    if (!CAMPAIGN_FIELDS.some(([key]) => campaign[key]) && !campaign.countries.length) throw new Error()
    return { ok: true, campaign }
  } catch { return { ok: false, reason: '草稿内容不完整，请换一种说法重试。' } }
}
export function getMissingFields(campaign: Campaign): string[] {
  return [...CAMPAIGN_FIELDS.filter(([key]) => !campaign[key].trim()).map(([,label]) => label),
    ...(!campaign.countries.length ? ['投放地区'] : [])]
}
export function validateCampaign(campaign: Campaign): string[] {
  const errors: string[] = []
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value
  for (const [label,value] of [['开始日期',campaign.startDate],['结束日期',campaign.endDate]]) {
    if (value && !validDate(value)) errors.push(`${label}请使用有效的 YYYY-MM-DD 日期。`)
  }
  if (validDate(campaign.startDate) && validDate(campaign.endDate) && campaign.endDate < campaign.startDate) errors.push('结束日期不能早于开始日期。')
  if (campaign.dailyBudget) {
    const amount = campaign.dailyBudget.replace(/,/g,'').match(/-?\d+(?:\.\d+)?/)
    if (!amount || Number(amount[0]) <= 0) errors.push('每日预算需要大于零，并注明币种。')
  }
  return errors
}
