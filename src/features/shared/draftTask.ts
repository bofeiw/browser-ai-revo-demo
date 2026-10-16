import { groundCampaign } from '../campaign-creator/groundCampaign'
import { buildMessages, buildRetryMessages } from '../smart-ticket-creator/prompt'
import { parseTicket } from '../smart-ticket-creator/parseTicket'
import type { Ticket } from '../smart-ticket-creator/types'
import { buildCampaignMessages } from '../campaign-creator/prompt'
import { parseCampaign } from '../campaign-creator/parseCampaign'
import type { Campaign } from '../campaign-creator/types'
export type DraftKind = 'ticket' | 'campaign'
export function buildDraftMessages(kind: DraftKind, input: string, retry = false) {
  return kind === 'campaign' ? buildCampaignMessages(input, retry) : retry ? buildRetryMessages(input) : buildMessages(input)
}
export function parseDraft(kind: DraftKind, raw: string, source?: string):
  | {ok:true;result:{status:'complete';ticket:Ticket}|{status:'campaign-complete';campaign:Campaign}}
  | {ok:false;reason:string} {
  if (kind === 'campaign') {
    const parsed = parseCampaign(raw)
    return parsed.ok ? {ok:true,result:{status:'campaign-complete',campaign: source === undefined ? parsed.campaign : groundCampaign(parsed.campaign, source)}} : parsed
  }
  const parsed = parseTicket(raw)
  return parsed.ok ? {ok:true,result:{status:'complete',ticket:parsed.ticket}} : parsed
}
