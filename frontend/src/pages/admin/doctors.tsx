import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Plus, Edit, Stethoscope, UserX, UserCheck } from "lucide-react"
import { format } from "date-fns"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import SearchBar from "@/components/ui/search-bar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { doctorsApi } from "@/services/endpoints"
import { useAuthStore } from "@/store/authStore"
import { useToast } from "@/components/ui/toast"
import DentalEmptyState from "@/components/ui/dental-empty-state"
import type { User } from "@/types"

interface DoctorForm {
  email: string
  password: string
  full_name: string
  phone: string
  specialization: string
  license_number: string
}

function getEmptyDoctorForm(): DoctorForm {
  return { email: "", password: "", full_name: "", phone: "", specialization: "", license_number: "" }
}

export default function AdminDoctors() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const { user: currentUser } = useAuthStore()
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDoctor, setEditingDoctor] = useState<User | null>(null)
  const [form, setForm] = useState<DoctorForm>(getEmptyDoctorForm)

  const { data, isLoading } = useQuery({
    queryKey: ["doctors", { search }],
    queryFn: () => doctorsApi.list({ search, page_size: 100 }),
  })

  const createMutation = useMutation({
    mutationFn: (data: DoctorForm) => doctorsApi.create({ ...data, role: "DOCTOR" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] })
      addToast({ title: "Success", description: "Doctor created successfully", variant: "success" })
      closeDialog()
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to create doctor", variant: "destructive" })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; payload: any }) => doctorsApi.update(data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] })
      addToast({ title: "Success", description: "Doctor updated successfully", variant: "success" })
      closeDialog()
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to update doctor", variant: "destructive" })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => doctorsApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] })
      addToast({ title: "Success", description: "Doctor deactivated", variant: "success" })
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to deactivate", variant: "destructive" })
    },
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => doctorsApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] })
      addToast({ title: "Success", description: "Doctor activated", variant: "success" })
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to activate", variant: "destructive" })
    },
  })

  const doctors: User[] = data || []

  function openCreateDialog() {
    setEditingDoctor(null)
    setForm(getEmptyDoctorForm())
    setDialogOpen(true)
  }

  function openEditDialog(doctor: User) {
    setEditingDoctor(doctor)
    setForm({
      email: doctor.email,
      password: "",
      full_name: doctor.full_name,
      phone: doctor.phone || "",
      specialization: doctor.specialization || "",
      license_number: doctor.license_number || "",
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingDoctor(null)
    setForm(getEmptyDoctorForm())
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) closeDialog()
    setDialogOpen(open)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingDoctor) {
      const payload: any = { full_name: form.full_name, phone: form.phone, specialization: form.specialization, license_number: form.license_number }
      if (form.password) payload.password = form.password
      updateMutation.mutate({ id: editingDoctor.id, payload })
    } else {
      createMutation.mutate(form)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader title="Doctors" description="Manage doctors across hospitals">
        <Button onClick={openCreateDialog}><Plus className="h-4 w-4" /> Add Doctor</Button>
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <SearchBar value={search} onChange={setSearch} placeholder="Search doctors by name..." className="w-full sm:w-72" />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : doctors.length === 0 ? (
            <DentalEmptyState
              icon={Stethoscope}
              title="No doctors found"
              description={search ? "Try a different search term." : "Add your first doctor to start building your dental team."}
              action={!search && <Button onClick={openCreateDialog}><Plus className="h-4 w-4" /> Add Doctor</Button>}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Specialization</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Created</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((doctor) => (
                    <motion.tr key={doctor.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="border-b border-gray-50 transition-colors hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{doctor.full_name}</td>
                      <td className="px-4 py-3 text-gray-500">{doctor.email}</td>
                      <td className="px-4 py-3 text-gray-500">{doctor.specialization || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={doctor.is_active ? "success" : "secondary"}>
                          {doctor.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {format(new Date(doctor.created_at), "MMM dd, yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(doctor)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          {doctor.is_active ? (
                            <Button variant="ghost" size="icon" onClick={() => deactivateMutation.mutate(doctor.id)}
                              className="text-warning hover:text-warning hover:bg-warning-soft">
                              <UserX className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => activateMutation.mutate(doctor.id)}
                              className="text-success hover:text-success hover:bg-success-soft">
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>{editingDoctor ? "Edit Doctor" : "Add Doctor"}</DialogTitle>
            <DialogDescription>
              {editingDoctor ? "Update doctor details." : "Create a new doctor account."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required={!editingDoctor} disabled={!!editingDoctor} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password {editingDoctor && "(leave blank to keep current)"}</Label>
                <Input id="password" type="password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editingDoctor} placeholder={editingDoctor ? "Leave blank to keep" : "Min. 8 characters"} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="specialization">Specialization</Label>
                <Input id="specialization" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="license_number">License Number</Label>
                <Input id="license_number" value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : editingDoctor ? "Update" : "Create Doctor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
