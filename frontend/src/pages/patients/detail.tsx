import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patientsApi, casesApi, appointmentsApi, billingApi, treatmentApi } from "@/services/endpoints";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatIndianRupees } from "@/lib/currency";
import type { Patient, Case, Appointment, Billing, TreatmentPlan } from "@/types";
import {
  User,
  Phone,
  Mail,
  Calendar,
  MapPin,
  Activity,
  FileText,
  Clock,
  ArrowLeft,
  Edit,
  ChevronRight,
} from "lucide-react";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase().replace(/_/g, "_")}`;
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>;
}

function PatientSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    gender: "",
    phone: "",
    email: "",
    address: "",
    medical_history: "",
    date_of_birth: "",
    age: "",
  });

  const { data: patient, isLoading, error } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  const { data: cases } = useQuery({
    queryKey: ["patient-cases", id],
    queryFn: () => casesApi.list({ patient_id: id }),
    enabled: !!id,
  });

  const { data: appointments } = useQuery({
    queryKey: ["patient-appointments", id],
    queryFn: () => appointmentsApi.list({ patient_id: id }),
    enabled: !!id,
  });

  const { data: billings } = useQuery({
    queryKey: ["patient-billings", id],
    queryFn: () => billingApi.list({ patient_id: id }),
    enabled: !!id,
  });

  const { data: treatmentPlans } = useQuery({
    queryKey: ["patient-treatment-plans", id],
    queryFn: () => treatmentApi.list({ patient_id: id }),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => patientsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", id] });
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" });
      addToast({ title: "Success", description: "Patient updated successfully", variant: "success" });
      setEditOpen(false);
    },
    onError: (err: Error) => {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => patientsApi.update(id!, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", id] });
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" });
      addToast({ title: "Success", description: "Status updated successfully", variant: "success" });
    },
    onError: (err: Error) => {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (patient) {
      setEditForm({
        full_name: patient.full_name || "",
        gender: patient.gender || "",
        phone: patient.phone || "",
        email: patient.email || "",
        address: patient.address || "",
        medical_history: patient.medical_history || "",
        date_of_birth: patient.date_of_birth || "",
        age: patient.age?.toString() || "",
      });
    }
  }, [patient]);

  if (isLoading) return <PatientSkeleton />;
  if (error || !patient) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-text-secondary">Patient not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/patients")}>
          Back to Patients
        </Button>
      </div>
    );
  }

  const casesList = Array.isArray(cases) ? cases : cases?.items || cases || [];
  const appointmentsList = Array.isArray(appointments) ? appointments : appointments?.items || appointments || [];
  const billingsList = Array.isArray(billings) ? billings : billings?.items || billings || [];
  const treatmentPlansList = Array.isArray(treatmentPlans) ? treatmentPlans : treatmentPlans?.items || treatmentPlans || [];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate("/patients")}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Patients
      </button>

      {/* Patient Header */}
      <Card className="p-6 border-border shadow-card">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Avatar */}
          <Avatar className="h-20 w-20 ring-4 ring-primary-light">
            <AvatarFallback className="bg-primary text-white text-xl font-bold">
              {getInitials(patient.full_name)}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary truncate">
                {patient.full_name}
              </h1>
              <StatusBadge status={patient.status} />
            </div>
            <p className="text-sm text-text-muted mt-1">
              ID: {patient.id.slice(0, 8)}...
            </p>
            <div className="flex flex-wrap gap-4 mt-3">
              {patient.age && (
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Calendar className="h-4 w-4 text-primary" />
                  {patient.age} yrs
                </div>
              )}
              {patient.gender && (
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <User className="h-4 w-4 text-primary" />
                  {patient.gender}
                </div>
              )}
              {patient.phone && (
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Phone className="h-4 w-4 text-primary" />
                  {patient.phone}
                </div>
              )}
              {patient.email && (
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Mail className="h-4 w-4 text-primary" />
                  {patient.email}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-primary text-primary hover:bg-primary-light">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Patient</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-4 px-6">
                  <div className="col-span-2">
                    <Label>Full Name</Label>
                    <Input
                      value={editForm.full_name}
                      onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <Select
                      value={editForm.gender}
                      onValueChange={(v) => setEditForm((f) => ({ ...f, gender: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Age</Label>
                    <Input
                      type="number"
                      value={editForm.age}
                      onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Address</Label>
                    <Textarea
                      value={editForm.address}
                      onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Medical History</Label>
                    <Textarea
                      value={editForm.medical_history}
                      onChange={(e) => setEditForm((f) => ({ ...f, medical_history: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-6 pb-4">
                  <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button
                    className="bg-primary hover:bg-primary-hover text-white"
                    onClick={() => updateMutation.mutate(editForm)}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Select
              value={patient.status}
              onValueChange={(v) => statusMutation.mutate(v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">New</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="UNDER_TREATMENT">Under Treatment</SelectItem>
                <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-white border border-border rounded-xl p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cases">Cases ({casesList.length})</TabsTrigger>
          <TabsTrigger value="appointments">Appointments ({appointmentsList.length})</TabsTrigger>
          <TabsTrigger value="treatment-plans">Treatment Plans ({treatmentPlansList.length})</TabsTrigger>
          <TabsTrigger value="billing">Billing ({billingsList.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 border-border shadow-card">
              <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Personal Information
              </h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Full Name</dt>
                  <dd className="font-medium">{patient.full_name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Gender</dt>
                  <dd className="font-medium">{patient.gender || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Age</dt>
                  <dd className="font-medium">{patient.age || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Date of Birth</dt>
                  <dd className="font-medium">{patient.date_of_birth || "—"}</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-6 border-border shadow-card">
              <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                Contact Information
              </h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Phone</dt>
                  <dd className="font-medium">{patient.phone || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Email</dt>
                  <dd className="font-medium">{patient.email || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Address</dt>
                  <dd className="font-medium">{patient.address || "—"}</dd>
                </div>
              </dl>
            </Card>

            {patient.medical_history && (
              <Card className="p-6 border-border shadow-card md:col-span-2">
                <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Medical History
                </h3>
                <p className="text-text-secondary whitespace-pre-wrap">{patient.medical_history}</p>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="cases" className="mt-6">
          {casesList.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-card">
              <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No cases found for this patient</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {casesList.map((c: Case) => (
                <Card
                  key={c.id}
                  className="p-4 border-border shadow-card card-hover cursor-pointer"
                  onClick={() => navigate(`/cases/${c.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">{c.chief_complaint}</p>
                      <p className="text-sm text-text-muted mt-1">
                        {c.diagnosis ? `Diagnosis: ${c.diagnosis.slice(0, 60)}` : "No diagnosis"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <StatusBadge status={c.status} />
                      <ChevronRight className="h-5 w-5 text-text-muted" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="appointments" className="mt-6">
          {appointmentsList.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-card">
              <Clock className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No appointments found</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {appointmentsList.map((a: Appointment) => (
                <Card key={a.id} className="p-4 border-border shadow-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-primary">
                        {a.appointment_date} at {a.appointment_time}
                      </p>
                      {a.notes && <p className="text-sm text-text-muted mt-1">{a.notes}</p>}
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="treatment-plans" className="mt-6">
          {treatmentPlansList.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-card">
              <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No treatment plans found</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {treatmentPlansList.map((t: TreatmentPlan) => (
                <Card key={t.id} className="p-4 border-border shadow-card">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">{t.treatment_name}</p>
                      <p className="text-sm text-text-muted mt-1">
                        Cost: {formatIndianRupees(t.cost)}
                        {t.duration_minutes && ` | Duration: ${t.duration_minutes} min`}
                      </p>
                    </div>
                    <div className="ml-4">
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="billing" className="mt-6">
          {billingsList.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-card">
              <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No billing records found</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {billingsList.map((b: Billing) => (
                <Card key={b.id} className="p-4 border-border shadow-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-primary">
                        {formatIndianRupees(b.total_amount)}
                      </p>
                      <div className="flex gap-4 mt-1 text-sm text-text-muted">
                        <span>Paid: {formatIndianRupees(b.paid_amount)}</span>
                        <span>Pending: {formatIndianRupees(b.pending_amount)}</span>
                      </div>
                    </div>
                    <StatusBadge status={b.payment_status} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
