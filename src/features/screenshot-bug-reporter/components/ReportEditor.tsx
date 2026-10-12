import { useCallback } from 'react'
import { cn } from '../../../lib/cn'
import type {
  BugReport,
  BugReportListField,
  BugReportTextField,
  Severity,
} from '../types'
import { SEVERITIES } from '../types'

interface ReportEditorProps {
  report: BugReport
  onChange: (report: BugReport) => void
}

const SEVERITY_STYLES: Record<Severity, string> = {
  Low: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
  Medium: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  High: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  Unknown: 'border-white/15 bg-white/5 text-gray-300',
}

const fieldLabel = 'block text-xs font-semibold uppercase tracking-wide text-gray-400'
const inputBase =
  'w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60'

/**
 * Fully editable view of the generated draft. Every field is a controlled
 * input so the user can correct the model before copying. List fields are
 * edited as one-item-per-line textareas for simplicity.
 */
export function ReportEditor({ report, onChange }: ReportEditorProps) {
  const setText = useCallback(
    (field: BugReportTextField, value: string) => {
      onChange({ ...report, [field]: value })
    },
    [onChange, report],
  )

  const setList = useCallback(
    (field: BugReportListField, value: string) => {
      const items = value.split('\n').map((s) => s.trimEnd())
      onChange({ ...report, [field]: items })
    },
    [onChange, report],
  )

  const setSeverity = useCallback(
    (value: Severity) => onChange({ ...report, severity: value }),
    [onChange, report],
  )

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="br-title" className={fieldLabel}>
          Title
        </label>
        <input
          id="br-title"
          type="text"
          value={report.title}
          onChange={(e) => setText('title', e.target.value)}
          placeholder="Concise summary of the suspected issue"
          className={inputBase}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="br-description" className={fieldLabel}>
          Description (what is observable)
        </label>
        <textarea
          id="br-description"
          rows={4}
          value={report.description}
          onChange={(e) => setText('description', e.target.value)}
          placeholder="What can actually be seen in the screenshot"
          className={cn(inputBase, 'resize-y')}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="br-errors" className={fieldLabel}>
          Visible error messages
        </label>
        <textarea
          id="br-errors"
          rows={2}
          value={report.visibleErrors}
          onChange={(e) => setText('visibleErrors', e.target.value)}
          placeholder="Exact text of any readable error — leave empty if none"
          className={cn(inputBase, 'resize-y font-mono text-xs')}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="br-elements" className={fieldLabel}>
            Affected UI elements
          </label>
          <textarea
            id="br-elements"
            rows={4}
            value={report.affectedElements.join('\n')}
            onChange={(e) => setList('affectedElements', e.target.value)}
            placeholder={'One per line\ne.g. Save button'}
            className={cn(inputBase, 'resize-y')}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="br-missing" className={fieldLabel}>
            Missing information
          </label>
          <textarea
            id="br-missing"
            rows={4}
            value={report.missingInformation.join('\n')}
            onChange={(e) => setList('missingInformation', e.target.value)}
            placeholder={'One per line\ne.g. Steps to reproduce'}
            className={cn(inputBase, 'resize-y')}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <span className={fieldLabel}>Suggested severity</span>
        <div className="flex flex-wrap items-center gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              aria-pressed={report.severity === s}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                report.severity === s
                  ? SEVERITY_STYLES[s]
                  : 'border-white/10 bg-transparent text-gray-500 hover:text-gray-300',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
