import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Settings, Plus, Trash2, Loader2, ToggleLeft, ToggleRight, Database } from "lucide-react"
import { crmSettingsApi, treatmentTypesApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

export default function CrmSettings() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [selectedTypeId, setSelectedTypeId] = useState("")
  const [fu1Day, setFu1Day] = useState(true)
  const [fu7Day, setFu7Day] = useState(true)
  const [recall6m, setRecall6m] = useState(true)
  const [recall12m, setRecall12m] = useState(true)
  const [customDays, setCustomDays] = useState("")

  const { data: rules, isLoading } = useQuery({
    queryKey: ["crm-settings", "rules"],
    queryFn: () => crmSettingsApi.rules.list(),
  })
  const rulesList: any[] = rules || []

  const { data: treatmentTypes } = useQuery({
    queryKey: ["treatment-types"],
    queryFn: () => treatmentTypesApi.list(),
  })
  const treatmentTypesList: any[] = treatmentTypes || []

  const createMutation = useMutation({
    mutationFn: (data: any) => crmSettingsApi.rules.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-settings"] })
      addToast({ title: "Rule Created", variant: "success" })
      setOpen(false); setSelectedTypeId(""); setFu1Day(true); setFu7Day(true); setRecall6m(true); setRecall12m(true); setCustomDays("")
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crmSettingsApi.rules.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-settings"] })
      addToast({ title: "Deleted", variant: "success" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => crmSettingsApi.rules.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-settings"] })
    },
  })

  const seedMutation = useMutation({
    mutationFn: () => treatmentTypesApi.seed(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["treatment-types"] })
      addToast({ title: "Seeded", description: `Created ${data.seeded?.length || 0} treatment types`, variant: "success" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Seed failed", variant: "destructive" }),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Settings" description="Configure treatment follow-up rules & recall periods">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Rule</Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Treatment Follow-Up Rules
            <Badge className="ml-2">{rulesList.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : treatmentTypesList.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No treatment types found in the database.</p>
              <p className="text-xs mt-1">Click "Add Rule" and then "Seed Default Types" to populate.</p>
            </div>
          ) : rulesList.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No rules configured. Add rules to auto-create follow-ups and recalls when treatments are completed.
            </div>
          ) : (
            <div className="space-y-3">
              {rulesList.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{r.treatment_type_name || r.treatment_name}</span>
                      <Badge className={`text-[10px] ${r.is_active ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {r.follow_up_1_day && <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">1-Day FU</span>}
                      {r.follow_up_7_day && <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700">7-Day FU</span>}
                      {r.recall_6_month && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">6-Month Recall</span>}
                      {r.recall_12_month && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">12-Month Recall</span>}
                      {r.custom_recall_days && <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-700">{r.custom_recall_days}-Day Recall</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => toggleMutation.mutate({ id: r.id, is_active: !r.is_active })}>
                      {r.is_active ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => { if (confirm("Delete this rule?")) deleteMutation.mutate(r.id) }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Treatment Rule</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Treatment Type</Label>
              {treatmentTypesList.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">No treatment types found</p>
                  <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                    {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Database className="h-4 w-4 mr-1" />}
                    Seed Default Types
                  </Button>
                </div>
              ) : (
                <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select treatment type" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[200px] overflow-y-auto">
                    {treatmentTypesList.map((tt: any) => (
                      <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">1-Day Follow-Up</Label>
                <Switch checked={fu1Day} onCheckedChange={setFu1Day} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">7-Day Follow-Up</Label>
                <Switch checked={fu7Day} onCheckedChange={setFu7Day} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">6-Month Recall</Label>
                <Switch checked={recall6m} onCheckedChange={setRecall6m} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">12-Month Recall</Label>
                <Switch checked={recall12m} onCheckedChange={setRecall12m} />
              </div>
              <div className="space-y-2">
                <Label>Custom Recall Days (optional)</Label>
                <Input type="number" value={customDays} onChange={(e) => setCustomDays(e.target.value)} placeholder="e.g. 90" />
              </div>
            </div>
            <Button className="w-full" onClick={() => createMutation.mutate({
              treatment_type_id: selectedTypeId,
              follow_up_1_day: fu1Day, follow_up_7_day: fu7Day,
              recall_6_month: recall6m, recall_12_month: recall12m,
              custom_recall_days: customDays ? parseInt(customDays) : undefined,
            })} disabled={!selectedTypeId || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
