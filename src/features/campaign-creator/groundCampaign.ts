import type { Campaign } from './types'

/** Only keep settings supported by the brief. This is deliberately conservative:
 * a plausible model guess is less useful than an honest empty field. */
export function groundCampaign(campaign: Campaign, brief: string): Campaign {
  const lower = brief.toLocaleLowerCase()
  const mentioned = (value: string) => value.trim().length > 0 && lower.includes(value.trim().toLocaleLowerCase())
  const budget = brief.match(/(?:每天(?:预算)?|每日(?:预算)?|日预算|daily(?:\s+budget)?)\s*(?:[:：为是]|of)?\s*((?:[A-Z]{3}\s*)?[$€£¥]?\s*\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:美元|港币|港元|新台币|台币|新加坡元|人民币|欧元|英镑|USD|HKD|SGD|TWD|CNY|EUR|GBP))?)/i)
    ?? brief.match(/((?:USD|HKD|SGD|TWD|CNY|EUR|GBP)\s*[$€£¥]?\s*\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:per\s+day|\/day|\/天)/i)
  const dates = [...brief.matchAll(/\b(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/g)]
    .map(match => `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`)
  const countryAliases = [
    ['台湾','台灣','Taiwan'],['香港','Hong Kong'],['新加坡','Singapore'],
    ['日本','Japan'],['美国','美國','United States','USA'],['英国','英國','United Kingdom'],
    ['马来西亚','馬來西亞','Malaysia'],['泰国','泰國','Thailand'],
  ]
  const countries = campaign.countries.flatMap(country => {
    if (mentioned(country)) return [country]
    const group = countryAliases.find(aliases => aliases.some(alias=>alias.toLowerCase() === country.toLowerCase()))
    const evidence = group?.find(mentioned)
    return evidence ? [evidence] : []
  })
  const objective = [
    ['注册',/注册|註冊|sign[ -]?ups?|registrations?/i],
    ['安装',/安装|安裝|installs?/i],['点击',/点击|點擊|clicks?/i],
    ['购买',/购买|購買|purchases?/i],['流量',/流量|traffic/i],
  ].find(([,pattern]) => (pattern as RegExp).test(brief))?.[0]
  return {
    ...campaign,
    product: mentioned(campaign.product) ? campaign.product : '',
    objective: typeof objective === 'string' ? objective : mentioned(campaign.objective) ? campaign.objective : '',
    countries: [...new Set(countries)],
    dailyBudget: budget?.[1].trim() ?? '',
    startDate: dates.includes(campaign.startDate) ? campaign.startDate : '',
    endDate: dates.includes(campaign.endDate) ? campaign.endDate : '',
    adFormat: mentioned(campaign.adFormat) ? campaign.adFormat : '',
  }
}
