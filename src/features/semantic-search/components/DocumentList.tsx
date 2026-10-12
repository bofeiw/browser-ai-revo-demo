import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { embeddableText, hashText, type IndexedDoc, type TicketDoc } from '../types'

interface DocumentListProps {
  docs: TicketDoc[]
  /** The current vector index, so each row can show indexed/stale state. */
  index: Map<string, IndexedDoc>
  disabled: boolean
  onAdd: (input: { title: string; description: string; category?: string }) => void
  onUpdate: (
    id: string,
    patch: Partial<Pick<TicketDoc, 'title' | 'description' | 'category'>>,
  ) => void
  onRemove: (id: string) => void
}

/** Is this document embedded with an up-to-date vector? */
function docIsCurrent(doc: TicketDoc, index: Map<string, IndexedDoc>): boolean {
  const entry = index.get(doc.id)
  return !!entry && entry.textHash === hashText(embeddableText(doc))
}

/**
 * The editable document collection: a scrollable list of tickets, each with its
 * index state, plus a small form to add a custom document. Editing or removing
 * a document marks the index outdated (surfaced by the parent).
 */
export function DocumentList({
  docs,
  index,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
}: DocumentListProps) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const submitNew = () => {
    if (!newTitle.trim() && !newDesc.trim()) return
    onAdd({ title: newTitle, description: newDesc })
    setNewTitle('')
    setNewDesc('')
    setAdding(false)
  }

  const startEdit = (doc: TicketDoc) => {
    setEditingId(doc.id)
    setEditTitle(doc.title)
    setEditDesc(doc.description)
  }

  const saveEdit = (id: string) => {
    onUpdate(id, { title: editTitle, description: editDesc })
    setEditingId(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          disabled={disabled}
          aria-expanded={adding}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add document
        </button>
      </div>

      {adding && (
        <div className="space-y-2 rounded-md border border-indigo-400/30 bg-indigo-500/5 p-3">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Short title (e.g. “Login fails on mobile”)"
            className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
          />
          <textarea
            rows={2}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description — write it however you like."
            className="w-full resize-y rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitNew}
              disabled={!newTitle.trim() && !newDesc.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
            >
              <Check className="size-3.5" aria-hidden="true" />
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setNewTitle('')
                setNewDesc('')
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10"
            >
              <X className="size-3.5" aria-hidden="true" />
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="max-h-[26rem] space-y-2 overflow-auto pr-1">
        {docs.map((doc) => {
          const current = docIsCurrent(doc, index)
          const isEditing = editingId === doc.id
          return (
            <li
              key={doc.id}
              className="rounded-md border border-white/10 bg-white/[0.02] p-3"
            >
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-gray-100 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
                  />
                  <textarea
                    rows={2}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full resize-y rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-gray-100 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(doc.id)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-400"
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-gray-200 transition-colors hover:bg-white/10"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-100">{doc.title}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                        {doc.category}
                      </span>
                      {doc.custom && (
                        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-indigo-300">
                          custom
                        </span>
                      )}
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                          current
                            ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                            : 'border border-amber-400/30 bg-amber-500/10 text-amber-300',
                        )}
                      >
                        {current ? 'indexed' : 'not indexed'}
                      </span>
                    </div>
                    <p className="truncate text-xs text-gray-400">{doc.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(doc)}
                      disabled={disabled}
                      aria-label={`Edit ${doc.title}`}
                      className="rounded-md border border-white/10 bg-white/5 p-1.5 text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-50"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(doc.id)}
                      disabled={disabled}
                      aria-label={`Remove ${doc.title}`}
                      className="rounded-md border border-white/10 bg-white/5 p-1.5 text-gray-300 transition-colors hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {docs.length === 0 && (
          <li className="rounded-md border border-dashed border-white/10 p-4 text-center text-sm text-gray-500">
            No documents. Add one above or reset to the sample tickets.
          </li>
        )}
      </ul>
    </div>
  )
}
