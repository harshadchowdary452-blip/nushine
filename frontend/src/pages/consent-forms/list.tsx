import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/store/authStore"
import { consentFormsApi } from "@/services/endpoints"
import api from "@/services/api"
import { useToast } from "@/components/ui/toast"
import { Search, Trash2, RotateCcw, Eye, Download, Upload } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ConsentForm } from "@/types"
import { extractDetail } from "@/types"

interface ConsentFormPatient {
  id: string
  full_name: string
  op_no?: string
  phone?: string
  op_number?: string
}

interface DoctorOption {
  id: string
  full_name: string
}

const CONSENT_TYPES = [
  "General Consent", "RCT Consent", "Extraction Consent", "Implant Consent",
  "Surgery Consent", "Orthodontic Consent", "Anesthesia Consent",
]

export default function ConsentFormList() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [showDeleted, setShowDeleted] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<ConsentFormPatient | null>(null)
  const [formType, setFormType] = useState("")
  const [customType, setCustomType] = useState("")
  const [doctorId, setDoctorId] = useState("")
  const [remarks, setRemarks] = useState("")
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [createLoading, setCreateLoading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["consent-forms", search, showDeleted],
    queryFn: () => consentFormsApi.list({
      search: search || undefined,
      is_deleted: showDeleted || undefined,
      limit: 200,
    }),
  })

  const { data: patientsData } = useQuery({
    queryKey: ["patients-search", patientSearch],
    queryFn: () =>
      api.get("/patients/search", { params: { q: patientSearch, limit: 10 } }).then((r) => r.data),
    enabled: patientSearch.length > 1,
  })

  const { data: doctorsData } = useQuery({
    queryKey: ["doctors-list"],
    queryFn: () => api.get("/doctors", { params: { limit: 200 } }).then((r) => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => consentFormsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent-forms"] })
      addToast({ title: "Deleted", description: "Consent form moved to recycle bin" })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => consentFormsApi.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent-forms"] })
      addToast({ title: "Restored", description: "Consent form restored successfully" })
    },
  })

  const handleCreate = useCallback(async () => {
    if (!pdfFile) {
      addToast({ title: "Error", description: "Please select a PDF file", variant: "destructive" })
      return
    }
    const type = formType === "Custom" ? customType : formType
    if (!type) {
      addToast({ title: "Error", description: "Please select a consent type", variant: "destructive" })
      return
    }
    setCreateLoading(true)
    try {
      const fd = new FormData()
      fd.append("patient_name", selectedPatient?.full_name || patientSearch || "Manual Entry")
      if (selectedPatient?.id) fd.append("patient_id", selectedPatient.id)
      if (selectedPatient?.op_no) fd.append("op_number", selectedPatient.op_no)
      if (selectedPatient?.phone) fd.append("phone", selectedPatient.phone)
      if (doctorId) fd.append("doctor_id", doctorId)
      fd.append("consent_type", type)
      if (remarks) fd.append("remarks", remarks)
      fd.append("hospital_id", user?.hospital_id || "")
      fd.append("file", pdfFile)
      await consentFormsApi.create(fd)
      queryClient.invalidateQueries({ queryKey: ["consent-forms"] })
      addToast({ title: "Success", description: "Consent form uploaded" })
      setCreateOpen(false)
      resetForm()
    } catch (err: unknown) {
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" })
    } finally {
      setCreateLoading(false)
    }
  }, [pdfFile, formType, customType, selectedPatient, patientSearch, doctorId, remarks, user, queryClient, addToast])

  const resetForm = () => {
    setSelectedPatient(null)
    setPatientSearch("")
    setFormType("")
    setCustomType("")
    setDoctorId("")
    setRemarks("")
    setPdfFile(null)
  }

  const handleDownload = async (id: string) => {
    try {
      const blob = await consentFormsApi.downloadPdf(id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `consent_${id.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      addToast({ title: "Error", description: "Download failed", variant: "destructive" })
    }
  }

  const items = data?.items || []
  const doctors = Array.isArray(doctorsData) ? doctorsData : doctorsData?.items || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Consent Forms</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Upload className="mr-2 h-4 w-4" /> Upload Consent Form</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload New Consent Form</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div>
                <Label>Search Patient</Label>
                <Input
                  placeholder="Type patient name or OP number..."
                  value={patientSearch}
                  onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null) }}
                />
                {patientSearch.length > 1 && !selectedPatient && patientsData && (
                  <div className="mt-1 max-h-40 overflow-auto rounded border p-1">
                    {(Array.isArray(patientsData) ? patientsData : []).map((p: ConsentFormPatient) => (
                      <div
                        key={p.id}
                        className="cursor-pointer rounded p-2 text-sm hover:bg-muted"
                        onClick={() => { setSelectedPatient(p); setPatientSearch(p.full_name) }}
                      >
                        {p.full_name}                       {p.op_no ? `(${p.op_no})` : ""} {p.phone ? `- ${p.phone}` : ""}
                      </div>
                    ))}
                    {(Array.isArray(patientsData) ? patientsData : []).length === 0 && (
                      <div className="p-2 text-sm text-muted-foreground">No patients found. Will use manual entry.</div>
                    )}
                  </div>
                )}
              </div>
              {selectedPatient && (
                <div className="rounded bg-muted p-3 text-sm">
                  <p><strong>Name:</strong> {selectedPatient.full_name}</p>
                  {selectedPatient.op_number && <p><strong>OP No:</strong> {selectedPatient.op_number}</p>}
                  {selectedPatient.phone && <p><strong>Phone:</strong> {selectedPatient.phone}</p>}
                </div>
              )}
              <div>
                <Label>Consent Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    <SelectItem value="Custom">Custom...</SelectItem>
                  </SelectContent>
                </Select>
                {formType === "Custom" && (
                  <Input
                    className="mt-2"
                    placeholder="Enter custom consent type"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                  />
                )}
              </div>
              <div>
                <Label>Doctor</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d: DoctorOption) => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Remarks</Label>
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              <div>
                <Label>PDF File *</Label>
                <Input type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
              </div>
              <Button onClick={handleCreate} disabled={createLoading} className="w-full">
                {createLoading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by patient, OP number, consent type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={showDeleted ? "default" : "outline"}
          size="sm"
          onClick={() => setShowDeleted(!showDeleted)}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          {showDeleted ? "Showing Deleted" : "Recycle Bin"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient Name</TableHead>
                <TableHead>OP Number</TableHead>
                <TableHead>Consent Type</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No consent forms found</TableCell></TableRow>
              ) : (
                items.map((cf: ConsentForm) => (
                  <TableRow key={cf.id} className={cf.is_deleted ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{cf.patient_name}</TableCell>
                    <TableCell>{cf.op_number || "-"}</TableCell>
                    <TableCell><Badge variant="outline">{cf.consent_type}</Badge></TableCell>
                    <TableCell>{cf.doctor_name || "-"}</TableCell>
                    <TableCell>{cf.created_at ? new Date(cf.created_at).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>{cf.uploader_name || "-"}</TableCell>
                    <TableCell className="text-right">
                      {cf.is_deleted ? (
                        <Button variant="ghost" size="sm" onClick={() => restoreMutation.mutate(cf.id)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/consent-forms/view/${cf.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDownload(cf.id)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(cf.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
