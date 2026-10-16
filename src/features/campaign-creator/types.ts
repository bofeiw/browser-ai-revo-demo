export interface Campaign {
  name: string
  product: string
  objective: string
  countries: string[]
  dailyBudget: string
  startDate: string
  endDate: string
  adFormat: string
  missingInformation: string[]
}
export const CAMPAIGN_FIELDS = [
  ['name', 'Campaign 名称'], ['product', '产品'], ['objective', '投放目标'],
  ['dailyBudget', '每日预算'], ['startDate', '开始日期'], ['endDate', '结束日期'],
  ['adFormat', '广告形式'],
] as const
