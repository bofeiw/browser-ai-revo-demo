import { useCallback } from 'react'
import { cn } from '../../../lib/cn'
import type {
  Priority,
  Ticket,
  TicketListField,
  TicketTextField,
  TicketType,
} from '../types'
import { PRIORITIES, TICKET_TYPES } from '../types'

interface TicketEditorProps {
  ticket: Ticket
  onChange: (ticket: Ticket) => void
}

const PRIORITY_STYLES: Record<Priority, string> = {
  Low: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
  Medium: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  High: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  Unknown: 'border-white/15 bg-white/5 text-gray-300',
}

const TYPE_STYLES: Record<TicketType, string> = {
  Bug: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  'Feature Request': 'border-violet-400/30 bg-violet-500/10 text-violet-300',
  Improvement: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  Other: 'border-white/15 bg-white/5 text-gray-300',
}

const fieldLabel = 'block text-xs font-semibold uppercase tracking-wide text-gray-400'
const inputBase =
  'w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60'

/**
 * Fully editable view of the generated ticket. Every field is a controlled
 * input so the user can correct the model before copying. List fields are
 * edited as one-item-per-line textareas for simplicity.
 */
export function TicketEditor({ ticket, onChange }: TicketEditorProps) {
  const setText = useCallback(
    (field: TicketTextField, value: string) => {
      onChange({ ...ticket, [field]: value })
    },
    [onChange, ticket],
  )

  const setList = useCallback(
    (field: TicketListField, value: string) => {
      const items = value.split('\n').map((s) => s.trimEnd())
      onChange({ ...ticket, [field]: items })
    },
    [onChange, ticket],
  )

  const setType = useCallback(
    (value: TicketType) => onChange({ ...ticket, type: value }),
    [onChange, ticket],
  )

  const setPriority = useCallback(
    (value: Priority) => onChange({ ...ticket, priority: value }),
    [onChange, ticket],
  )

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="tc-title" className={fieldLabel}>
          Title
        </label>
        <input
          id="tc-title"
          type="text"
          value={ticket.title}
          onChange={(e) => setText('title', e.target.value)}
          placeholder="Concise, actionable summary"
          className={inputBase}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tc-description" className={fieldLabel}>
          Description
        </label>
        <textarea
          id="tc-description"
          rows={4}
          value={ticket.description}
          onChange={(e) => setText('description', e.target.value)}
          placeholder="Clear restatement of the reported problem"
          className={cn(inputBase, 'resize-y')}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className={fieldLabel}>Type</span>
          <div className="flex flex-wrap items-center gap-2">
            {TICKET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={ticket.type === t}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  ticket.type === t
                    ? TYPE_STYLES[t]
                    : 'border-white/10 bg-transparent text-gray-500 hover:text-gray-300',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className={fieldLabel}>Suggested priority</span>
          <div className="flex flex-wrap items-center gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                aria-pressed={ticket.priority === p}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  ticket.priority === p
                    ? PRIORITY_STYLES[p]
                    : 'border-white/10 bg-transparent text-gray-500 hover:text-gray-300',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="tc-expected" className={fieldLabel}>
            Expected behavior
          </label>
          <textarea
            id="tc-expected"
            rows={3}
            value={ticket.expectedBehavior}
            onChange={(e) => setText('expectedBehavior', e.target.value)}
            placeholder="What the user expected — leave empty if unknown"
            className={cn(inputBase, 'resize-y')}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tc-actual" className={fieldLabel}>
            Actual behavior
          </label>
          <textarea
            id="tc-actual"
            rows={3}
            value={ticket.actualBehavior}
            onChange={(e) => setText('actualBehavior', e.target.value)}
            placeholder="What the user observed — leave empty if unknown"
            className={cn(inputBase, 'resize-y')}
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="tc-steps" className={fieldLabel}>
            Steps to reproduce
          </label>
          <textarea
            id="tc-steps"
            rows={4}
            value={ticket.stepsToReproduce.join('\n')}
            onChange={(e) => setList('stepsToReproduce', e.target.value)}
            placeholder={'One per line\ne.g. Click Save repeatedly'}
            className={cn(inputBase, 'resize-y')}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tc-missing" className={fieldLabel}>
            Missing information
          </label>
          <textarea
            id="tc-missing"
            rows={4}
            value={ticket.missingInformation.join('\n')}
            onChange={(e) => setList('missingInformation', e.target.value)}
            placeholder={'One per line\ne.g. Which browser and OS?'}
            className={cn(inputBase, 'resize-y')}
          />
        </div>
      </div>
    </div>
  )
}
