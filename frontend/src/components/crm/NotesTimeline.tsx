import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Textarea } from "../ui/textarea"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { Loader2, MessageSquare, Plus, Clock, User as UserIcon } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { showErrorToast } from "@/utils/showErrorToast"
import { crmApi } from "../../services/endpoints"

interface Note {
  id: string
  feedback_id: string
  content: string
  created_by?: string
  created_by_name?: string
  edit_history?: Array<{ previous: string; edited_at: string; edited_by?: string }>
  created_at?: string
  updated_at?: string
}

interface Props {
  feedbackId: string | null
  feedbackType: "lead" | "patient"
}

export function NotesTimeline({ feedbackId, feedbackType: _feedbackType }: Props) {
  const { addToast } = useToast()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [newNote, setNewNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!feedbackId) return
    setLoading(true)
    crmApi.feedbackNotes.list(feedbackId)
      .then(setNotes)
      .catch((err: unknown) => showErrorToast(err, addToast))
      .finally(() => setLoading(false))
  }, [feedbackId, addToast])

  async function handleAdd() {
    if (!feedbackId || !newNote.trim()) return
    setSaving(true)
    try {
      const note = await crmApi.feedbackNotes.add(feedbackId, newNote.trim())
      setNotes((prev) => [...prev, note])
      setNewNote("")
      addToast({ title: "Note added", variant: "success" })
    } catch {
      addToast({ title: "Error", description: "Failed to add note", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Notes Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add note */}
        <div className="flex gap-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add an internal note..."
            rows={2}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAdd() } }}
          />
          <Button size="icon" onClick={handleAdd} disabled={!newNote.trim() || saving} className="self-end">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {/* Notes list */}
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No notes yet</p>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserIcon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 w-px bg-border mt-1" />
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{note.created_by_name || "Staff"}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {note.created_at ? new Date(note.created_at).toLocaleString() : ""}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    {note.edit_history && note.edit_history.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">(edited {note.edit_history.length} time(s))</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
