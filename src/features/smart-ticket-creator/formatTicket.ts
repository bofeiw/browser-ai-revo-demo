/** Serialize a {@link Ticket} for the clipboard, as Markdown or as JSON. */
import type { Ticket } from './types'

/** Human-readable Markdown for the "Copy Ticket" button. */
export function ticketToMarkdown(ticket: Ticket): string {
  const list = (items: string[]) =>
    items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : '_None noted_'

  const steps =
    ticket.stepsToReproduce.length > 0
      ? ticket.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '_None provided_'

  return [
    `# ${ticket.title || 'Untitled ticket'}`,
    '',
    '> Draft generated locally from an unstructured complaint. Review before filing.',
    '',
    `**Type:** ${ticket.type}  `,
    `**Suggested priority:** ${ticket.priority}`,
    '',
    '## Description',
    ticket.description || '_Not provided_',
    '',
    '## Expected behavior',
    ticket.expectedBehavior || '_Unknown_',
    '',
    '## Actual behavior',
    ticket.actualBehavior || '_Unknown_',
    '',
    '## Steps to reproduce',
    steps,
    '',
    '## Missing information',
    list(ticket.missingInformation),
    '',
  ].join('\n')
}

/** Pretty-printed JSON for the "Copy JSON" button. */
export function ticketToJson(ticket: Ticket): string {
  return JSON.stringify(ticket, null, 2)
}
