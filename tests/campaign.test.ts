import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCampaign, getMissingFields, validateCampaign } from '../src/features/campaign-creator/parseCampaign'
import { parseDraft, buildDraftMessages } from '../src/features/shared/draftTask'
const valid = { name:'Taiwan signup', product:'Example', objective:'注册', countries:['台湾'], dailyBudget:'USD 100', startDate:'2026-10-19', endDate:'2026-10-25', adFormat:'Native', missingInformation:[] }
test('preserves a campaign from fenced output and computes missing fields', () => {
 const result = parseCampaign('```json\n'+JSON.stringify({...valid, product:''})+'\n```')
 assert.equal(result.ok, true)
 if (!result.ok) return
 assert.equal(result.campaign.dailyBudget, 'USD 100')
 assert.deepEqual(result.campaign.countries, ['台湾'])
 assert.ok(getMissingFields(result.campaign).includes('产品'))
})
test('rejects empty objects, non-JSON and degenerate output', () => {
 for (const raw of ['{}','No campaign here','!'.repeat(100),'[]']) assert.equal(parseCampaign(raw).ok, false)
})
test('does not invent a budget or dates absent from the response', () => {
 const result = parseCampaign('{"name":"Draft","countries":["台湾"]}')
 assert.equal(result.ok,true)
 if (!result.ok) return
 assert.equal(result.campaign.dailyBudget,'')
 assert.equal(result.campaign.startDate,'')
 assert.ok(getMissingFields(result.campaign).includes('每日预算'))
})
test('flags impossible dates, reversed schedules and nonpositive budgets', () => {
 assert.ok(validateCampaign({...valid,startDate:'2026-02-30'}).length)
 assert.ok(validateCampaign({...valid,endDate:'2026-10-18'}).length)
 assert.ok(validateCampaign({...valid,dailyBudget:'USD -100'}).length)
 assert.equal(validateCampaign(valid).length,0)
})
test('routes ticket and campaign output separately through the reused draft workflow', () => {
 const campaign = parseDraft('campaign',JSON.stringify(valid))
 assert.equal(campaign.ok,true)
 if (campaign.ok) assert.equal(campaign.result.status,'campaign-complete')
 const ticket = parseDraft('ticket','{"title":"Broken save","description":"Save fails"}')
 assert.equal(ticket.ok,true)
 if (ticket.ok) assert.equal(ticket.result.status,'complete')
 assert.ok(buildDraftMessages('campaign','投放台湾')[0].content.includes('campaign'))
 assert.ok(buildDraftMessages('ticket','Save fails')[0].content.includes('issue'))
})
test('preserves explicit currency from the brief when the model shortens it', () => {
 const result = parseDraft('campaign', JSON.stringify({...valid,dailyBudget:'$100'}), 'Taiwan campaign, daily budget USD 100, 2026-10-19 to 2026-10-25')
 assert.equal(result.ok,true)
 if (result.ok && result.result.status === 'campaign-complete') assert.equal(result.result.campaign.dailyBudget,'USD 100')
})
test('clears a budget invented for a brief that explicitly leaves it undecided', () => {
 const result = parseDraft('campaign', JSON.stringify({...valid,dailyBudget:'USD 100'}), '投放香港，预算还没确定，日期还没确定')
 assert.equal(result.ok,true)
 if (result.ok && result.result.status === 'campaign-complete') assert.equal(result.result.campaign.dailyBudget,'')
})
test('removes invented product, dates and format from an incomplete brief', () => {
 const result = parseDraft('campaign', JSON.stringify({...valid,product:'Product Name',startDate:'2023-09-01',endDate:'2024-07-31',adFormat:'online',countries:['Hong Kong']}), '想为我们的新产品做一个面向香港的注册推广，还没确定预算和日期。')
 assert.equal(result.ok,true)
 if (result.ok && result.result.status === 'campaign-complete') {
  const draft=result.result.campaign
  assert.equal(draft.product,'');assert.equal(draft.startDate,'');assert.equal(draft.endDate,'');assert.equal(draft.adFormat,'')
  assert.deepEqual(draft.countries,['香港'])
 }
})
