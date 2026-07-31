import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { FileText, Pin, PinOff, Search, Plus, Clock, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { leadsApi } from "@/services/endpoints"
import type { Lead, LeadCommunication } from "@/types"

interface LeadNotesProps {
  lead: Lead
}

interface Note {
  id: string
  lead_id: string
  note: string
  is_pinned: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export default function LeadNotes({ lead }: LeadNotesProps) {
  const [search, setSearch] = useState("")
  const [newNote, setNewNote] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data: communications, isLoading } = useQuery({
    queryKey: ["lead-communications", lead.id],
    queryFn: () => leadsApi.getCommunications(lead.id),
    enabled: !!lead.id,
  })

  const notes: Note[] = useMemo(() => {
    const comms: LeadCommunication[] = Array.isArray(communications) ? communications : []
    return comms
      .filter((c) => c.channel === "NOTE")
      .map((c) => ({
        id: c.id,
        lead_id: lead.id,
        note: c.message,
        is_pinned: false,
        created_by: c.sent_by || null,
        created_at: c.created_at,
        updated_at: c.created_at,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [communications, lead.id])

  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      return leadsApi.addCommunication(lead.id, {
        channel: "NOTE",
        message: note,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] })
      queryClient.invalidateQueries({ queryKey: ["lead-communications", lead.id] })
      addToast({ title: "Note added", variant: "success" })
      setNewNote("")
      setIsAdding(false)
    },
    onError: () => addToast({ title: "Error", description: "Failed to add note", variant: "destructive" }),
  })

  const filteredNotes = notes.filter((n) =>
    n.note.toLowerCase().includes(search.toLowerCase())
  )

  const pinnedNotes = filteredNotes.filter((n) => n.is_pinned)
  const unpinnedNotes = filteredNotes.filter((n) => !n.is_pinned)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
          <Input
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button size="sm" onClick={() => setIsAdding(!isAdding)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
        </Button>
      </div>

      {isAdding && (
        <div className="rounded-lg border border-[var(--ds-border)] p-3 space-y-2 bg-[var(--ds-surface)]">
          <Textarea
            placeholder="Write a note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setIsAdding(false); setNewNote("") }}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => newNote.trim() && addNoteMutation.mutate(newNote.trim())}
              disabled={!newNote.trim() || addNoteMutation.isPending}
            >
              {addNoteMutation.isPending ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </div>
      )}

      {pinnedNotes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ds-text-secondary)] uppercase tracking-wider">
            <Pin className="h-3 w-3" /> Pinned
          </div>
          {pinnedNotes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : unpinnedNotes.length === 0 && pinnedNotes.length === 0 && !isAdding ? (
        <div className="py-12 text-center">
          <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--ds-text-tertiary)]" />
          <p className="text-sm text-[var(--ds-text-tertiary)]">No notes yet</p>
        </div>
      ) : null}

      {unpinnedNotes.length > 0 && (
        <div className="space-y-2">
          {pinnedNotes.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ds-text-secondary)] uppercase tracking-wider mt-4">
              <FileText className="h-3 w-3" /> All Notes
            </div>
          )}
          {unpinnedNotes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  )
}

function NoteCard({ note }: { note: Note }) {
  return (
    <div className="rounded-lg border border-[var(--ds-border-light)] bg-[var(--ds-surface)] p-3 hover:border-[var(--ds-border)] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--ds-text-secondary)] whitespace-pre-wrap">{note.note}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {note.is_pinned ? (
            <PinOff className="h-3.5 w-3.5 text-amber-500 cursor-pointer hover:text-amber-600" />
          ) : (
            <Pin className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)] cursor-pointer hover:text-[var(--ds-text-tertiary)]" />
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--ds-text-tertiary)]">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {format(new Date(note.created_at), "dd MMM yyyy, hh:mm a")}
        </span>
        {note.created_by && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {note.created_by.slice(0, 8)}
          </span>
        )}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          Lead Note
        </Badge>
      </div>
    </div>
  )
}
