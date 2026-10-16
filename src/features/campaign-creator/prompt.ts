import type { ChatMessage } from '../smart-ticket-creator/prompt'
const SYSTEM = `You extract an advertising campaign draft from a user's brief. Return ONLY one JSON object with exactly these fields:
{"name":"", "product":"", "objective":"", "countries":[], "dailyBudget":"", "startDate":"", "endDate":"", "adFormat":"", "missingInformation":[]}
All fields are strings except countries and missingInformation which are arrays of strings.
Extract ONLY facts explicitly stated in the user's brief. Do not invent a product, budget, dates, year, bid, objective or ad format. Leave absent fields empty. Preserve budget amounts and currencies exactly. Dates: YYYY-MM-DD only when the year, month and day are stated. Keep an ambiguous date in missingInformation instead. Keep countries as names. A short descriptive name may summarize the stated brief. Do not calculate a total budget or make promises about performance. missingInformation: short questions about important missing details.
Use the user's language for descriptive text. This is a draft for human review, not a launched campaign.`
const EXAMPLE_INPUT = 'Create a campaign for Atlas app, target Singapore, sign-ups, daily budget USD 80, native ads, 2026-11-02 to 2026-11-08.'
const EXAMPLE_OUTPUT = JSON.stringify({name:'Atlas Singapore sign-ups',product:'Atlas app',objective:'sign-ups',countries:['Singapore'],dailyBudget:'USD 80',startDate:'2026-11-02',endDate:'2026-11-08',adFormat:'native',missingInformation:[]})
export function buildCampaignMessages(brief: string, retry = false): ChatMessage[] {
  return [
    {role:'system',content: SYSTEM + (retry ? '\nYour previous output was invalid. Produce the JSON object only. Empty strings for missing facts.' : '')},
    {role:'user',content:EXAMPLE_INPUT}, {role:'assistant',content:EXAMPLE_OUTPUT},
    {role:'user',content:brief.trim()},
  ]
}
export const CAMPAIGN_EXAMPLES = [
  { label: '完整投放需求', text: '为 Aurora App 创建注册推广，投放台湾，每天预算 USD 100，日期 2026-10-19 到 2026-10-25，使用 Native 广告。' },
  { label: '信息还不完整', text: '想为我们的新产品做一个面向香港的注册推广，还没确定预算和日期。' },
  { label: 'English brief', text: 'Promote Bloom app in Singapore for sign-ups. Daily budget SGD 120, from 2026-11-01 to 2026-11-07, using native ads.' },
]
