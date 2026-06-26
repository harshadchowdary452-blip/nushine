import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patientsApi, casesApi, appointmentsApi, billingApi, treatmentApi, campaignsApi, crmApi, usersApi, doctorsApi, consentFormsApi } from "@/services/endpoints";
import api from "@/services/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatIndianRupees } from "@/lib/currency";
import SearchableSelect from "@/components/ui/searchable-select";
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
  Camera,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MessageSquare,
  Loader2,
  CalendarDays,
  Plus,
  CalendarRange,
  Stethoscope,
  CreditCard,
  ScrollText,
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
  const [activeTab, setActiveTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    gender: "",
    phone: "",
    email: "",
    patient_source: "",
    source_campaign_name: "",
    source_campaign_id: "",
    source_campaign_date: "",
    address: "",
    medical_history: "",
    diagnosis: "",
    age: "",
    status: "",
    height: "",
    weight: "",
    bp: "",
    sugar: "",
    spo2: "",
    op_no: "",
  });

  // Quick Create dialogs
  const [apptOpen, setApptOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [apptForm, setApptForm] = useState({ doctor_id: "", appointment_date: "", appointment_time: "", notes: "" });
  const [caseForm, setCaseForm] = useState({ doctor_id: "", chief_complaint: "", diagnosis: "", notes: "" });

  const { data: doctorsData } = useQuery({
    queryKey: ["doctors", "dropdown"],
    queryFn: () => doctorsApi.list({ page_size: 200 }),
  });
  const doctors: any[] = Array.isArray(doctorsData) ? doctorsData : doctorsData?.items || [];

  const createApptMutation = useMutation({
    mutationFn: (data: any) => appointmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", id] });
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" });
      addToast({ title: "Success", description: "Appointment created", variant: "success" });
      setApptOpen(false);
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to create appointment", variant: "destructive" });
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: (data: any) => casesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-cases", id] });
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" });
      addToast({ title: "Success", description: "Case created", variant: "success" });
      setCaseOpen(false);
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to create case", variant: "destructive" });
    },
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

  const { data: interactions } = useQuery({
    queryKey: ["patient-interactions", id],
    queryFn: () => campaignsApi.analytics.patientInteractions(id!),
    enabled: !!id,
  });

  const { data: followUpResponses } = useQuery({
    queryKey: ["patient-follow-up-responses", id],
    queryFn: () => crmApi.followUpResponses.listByPatient(id!),
    enabled: !!id,
  });

  const { data: treatmentPlans } = useQuery({
    queryKey: ["patient-treatment-plans", id],
    queryFn: () => treatmentApi.list({ patient_id: id }),
    enabled: !!id,
  });

  const { data: followUpHistory } = useQuery({
    queryKey: ["patient-follow-up-history", id],
    queryFn: () => crmApi.patientFollowUpHistory(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => patientsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", id] });
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
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
      queryClient.invalidateQueries({ queryKey: ["crm"] });
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
        patient_source: patient.patient_source || "",
        source_campaign_name: patient.source_campaign_name || "",
        source_campaign_id: patient.source_campaign_id || "",
        source_campaign_date: patient.source_campaign_date || "",
        address: patient.address || "",
        medical_history: patient.medical_history || "",
        diagnosis: patient.diagnosis || "",
        age: patient.age?.toString() || "",
        status: patient.status || "",
        height: patient.height?.toString() || "",
        weight: patient.weight?.toString() || "",
        bp: patient.bp || "",
        sugar: patient.sugar || "",
        spo2: patient.spo2 || "",
        op_no: patient.op_no || "",
      });
    }
  }, [patient]);

  const tabBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = tabBarRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeTab]);

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
  const interactionsList: any[] = interactions || [];
  const followUpResponsesList: any[] = followUpResponses || [];

  function renderTimeline() {
    type TimelineItem = { date: string; type: string; label: string; description: string; id: string };
    const events: TimelineItem[] = [];

    appointmentsList.forEach((a: any) => {
      events.push({ date: a.appointment_date, type: "appointment", label: `Appointment — ${a.status || "SCHEDULED"}`, description: `${a.appointment_time || ""} ${a.notes ? "— " + a.notes : ""}`, id: a.id });
    });
    casesList.forEach((c: any) => {
      events.push({ date: c.created_at?.split("T")[0] || "", type: "case", label: `Case Created — ${c.chief_complaint || ""}`, description: c.diagnosis ? `Diagnosis: ${c.diagnosis}` : "", id: c.id });
    });
    treatmentPlansList.forEach((t: any) => {
      events.push({ date: t.start_date || t.created_at?.split("T")[0] || "", type: "treatment", label: `Treatment — ${t.treatment_name || ""}`, description: `Cost: ${formatIndianRupees(t.cost)}`, id: t.id });
    });
    billingsList.forEach((b: any) => {
      events.push({ date: b.created_at?.split("T")[0] || "", type: "billing", label: `Billing — ${b.payment_status || "DRAFT"}`, description: `Amount: ${formatIndianRupees(b.total_amount)}`, id: b.id });
    });
    interactionsList.forEach((i: any) => {
      events.push({ date: i.created_at?.split("T")[0] || "", type: "interaction", label: `${i.type || "Interaction"} ${i.channel ? "via " + i.channel : ""}`, description: i.message || i.notes || "", id: i.id || `i-${Math.random()}` });
    });
    followUpResponsesList.forEach((r: any) => {
      events.push({ date: r.created_at?.split("T")[0] || "", type: "response", label: `Follow-Up Response — ${r.response_status || ""}`, description: r.response_message || "", id: r.id });
    });

    events.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    if (events.length === 0) {
      return (
        <Card className="p-12 text-center border-border shadow-card">
          <Clock className="h-12 w-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">No timeline events</p>
        </Card>
      );
    }

    const typeStyles: Record<string, string> = {
      appointment: "bg-blue-50 text-blue-600 border-blue-200",
      case: "bg-purple-50 text-purple-600 border-purple-200",
      treatment: "bg-green-50 text-green-600 border-green-200",
      billing: "bg-amber-50 text-amber-600 border-amber-200",
      interaction: "bg-cyan-50 text-cyan-600 border-cyan-200",
      response: "bg-teal-50 text-teal-600 border-teal-200",
    };

    return (
      <div className="relative pl-8 border-l-2 border-border space-y-6">
        {events.map((ev, idx) => (
          <div key={`${ev.id}-${idx}`} className="relative">
            <div className={`absolute -left-[25px] p-1 rounded-full border-2 ${typeStyles[ev.type] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
              <div className="h-2 w-2 rounded-full bg-current" />
            </div>
            <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ev.type}</span>
                <span className="text-xs text-text-muted">{ev.date || ""}</span>
              </div>
              <p className="text-sm font-medium text-text-primary">{ev.label}</p>
              {ev.description && <p className="text-xs text-text-secondary mt-1">{ev.description}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const tabs: { value: string; label: string; icon: any; getCount?: () => number | null }[] = [
    { value: "overview", label: "Overview", icon: User },
    { value: "cases", label: "Cases", icon: FileText, getCount: () => casesList.length },
    { value: "appointments", label: "Appointments", icon: Calendar, getCount: () => appointmentsList.length },
    { value: "treatments", label: "Treatments", icon: Activity, getCount: () => treatmentPlansList.length },
    { value: "billing", label: "Billing", icon: CreditCard, getCount: () => billingsList.length },
    { value: "responses", label: "Responses", icon: MessageSquare, getCount: () => followUpResponsesList.length },
    { value: "follow-ups", label: "Follow-Ups", icon: CalendarDays, getCount: () => followUpHistory?.length || 0 },
    { value: "timeline", label: "Timeline", icon: Clock },
    { value: "images", label: "Images", icon: Camera },
    { value: "consent-forms", label: "Consent Forms", icon: ScrollText },
  ];

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
            {/* Quick Create Appointment */}
            <Dialog open={apptOpen} onOpenChange={setApptOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary text-white hover:bg-primary-hover">
                  <CalendarRange className="h-4 w-4 mr-1.5" />
                  Appointment
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Create Appointment</DialogTitle>
                  <DialogDescription>New appointment for {patient.full_name}</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createApptMutation.mutate({ patient_id: id, ...apptForm });
                }}>
                  <DialogBody className="space-y-4">
                    <div className="rounded-xl bg-primary-light/10 p-3 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary text-white text-sm">{getInitials(patient.full_name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{patient.full_name}</p>
                        {patient.phone && <p className="text-xs text-text-muted">{patient.phone}</p>}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Doctor</Label>
                      <Select value={apptForm.doctor_id} onValueChange={(v) => setApptForm({ ...apptForm, doctor_id: v })} required>
                        <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                        <SelectContent>
                          {doctors.map((d: any) => (
                            <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Date</Label>
                        <Input type="date" value={apptForm.appointment_date} onChange={(e) => setApptForm({ ...apptForm, appointment_date: e.target.value })} required />
                      </div>
                      <div className="grid gap-2">
                        <Label>Time</Label>
                        <Input type="time" value={apptForm.appointment_time} onChange={(e) => setApptForm({ ...apptForm, appointment_time: e.target.value })} required />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Notes</Label>
                      <Textarea value={apptForm.notes} onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })} rows={2} />
                    </div>
                  </DialogBody>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setApptOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createApptMutation.isPending}>
                      {createApptMutation.isPending ? "Creating..." : "Create Appointment"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Quick Create Case */}
            <Dialog open={caseOpen} onOpenChange={setCaseOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-primary text-primary hover:bg-primary-light">
                  <Stethoscope className="h-4 w-4 mr-1.5" />
                  Case
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Create Case</DialogTitle>
                  <DialogDescription>New case for {patient.full_name}</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createCaseMutation.mutate({ patient_id: id, ...caseForm });
                }}>
                  <DialogBody className="space-y-4">
                    <div className="rounded-xl bg-primary-light/10 p-3 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary text-white text-sm">{getInitials(patient.full_name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{patient.full_name}</p>
                        {patient.phone && <p className="text-xs text-text-muted">{patient.phone}</p>}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Doctor</Label>
                      <Select value={caseForm.doctor_id} onValueChange={(v) => setCaseForm({ ...caseForm, doctor_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                        <SelectContent>
                          {doctors.map((d: any) => (
                            <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Chief Complaint *</Label>
                      <Input value={caseForm.chief_complaint} onChange={(e) => setCaseForm({ ...caseForm, chief_complaint: e.target.value })} required placeholder="e.g. Tooth pain" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Diagnosis</Label>
                      <Input value={caseForm.diagnosis} onChange={(e) => setCaseForm({ ...caseForm, diagnosis: e.target.value })} placeholder="Initial diagnosis" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Notes</Label>
                      <Textarea value={caseForm.notes} onChange={(e) => setCaseForm({ ...caseForm, notes: e.target.value })} rows={2} />
                    </div>
                  </DialogBody>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCaseOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createCaseMutation.isPending}>
                      {createCaseMutation.isPending ? "Creating..." : "Create Case"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Call & WhatsApp quick actions */}
            {patient.phone && (
              <>
                <a href={`tel:${patient.phone}`}>
                  <Button size="sm" variant="outline" className="border-gray-300 dark:border-[#475569]">
                    <Phone className="h-4 w-4 mr-1.5" />
                    Call
                  </Button>
                </a>
                <a href={`https://wa.me/${patient.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                  `Hello ${patient.patient_name},\n\nThank you for visiting ${patient.hospital_name || "our clinic"}.\nPlease let us know if you need any assistance.\n\nRegards,\n${patient.hospital_name || "Our Clinic"}`
                )}`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="border-gray-300 dark:border-[#475569]">
                    <MessageSquare className="h-4 w-4 mr-1.5" />
                    WhatsApp
                  </Button>
                </a>
              </>
            )}

            {/* Edit */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-primary text-primary hover:bg-primary-light">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>Edit Patient</DialogTitle>
                  <DialogDescription>Update patient information below.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  {/* Personal Details */}
                  <div className="rounded-xl border border-gray-100 dark:border-[#334155] p-4 mb-4">
                    <h4 className="text-sm font-semibold text-primary flex items-center gap-2 mb-3">
                      <User className="h-4 w-4" />
                      Personal Details
                    </h4>
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <Label>Full Name</Label>
                        <Input
                          value={editForm.full_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Gender</Label>
                          <Select value={editForm.gender} onValueChange={(v) => setEditForm((f) => ({ ...f, gender: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MALE">Male</SelectItem>
                              <SelectItem value="FEMALE">Female</SelectItem>
                              <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label>Age</Label>
                          <Input
                            type="number"
                            value={editForm.age}
                            onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="grid gap-2 mt-3">
                        <Label>OP No.</Label>
                        <Input
                          value={editForm.op_no}
                          onChange={(e) => setEditForm((f) => ({ ...f, op_no: e.target.value }))}
                          placeholder="e.g. OP-2024-001"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="rounded-xl border border-gray-100 dark:border-[#334155] p-4 mb-4">
                    <h4 className="text-sm font-semibold text-primary flex items-center gap-2 mb-3">
                      <Phone className="h-4 w-4" />
                      Contact Information
                    </h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Phone</Label>
                          <Input
                            value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Email</Label>
                          <Input
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>How Did You Hear About Us?</Label>
                        <SearchableSelect
                          value={editForm.patient_source}
                          onValueChange={(v) => setEditForm((f) => ({ ...f, patient_source: v }))}
                          options={["Walk-In", "Google Search", "Google Maps", "Instagram", "Facebook", "WhatsApp", "Website", "Referral - Existing Patient", "Referral - Doctor", "Referral - Clinic", "Advertisement", "Banner", "Newspaper", "YouTube", "Campaign", "Event", "Lead", "Other"]}
                          placeholder="Search or select source..."
                        />
                      </div>
                      {editForm.patient_source === "Campaign" && (
                        <div className="grid grid-cols-3 gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                          <div className="grid gap-1">
                            <Label className="text-xs">Campaign Name</Label>
                            <Input className="h-8 text-xs" placeholder="Campaign name"
                              value={editForm.source_campaign_name}
                              onChange={(e) => setEditForm((f) => ({ ...f, source_campaign_name: e.target.value }))}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Campaign ID</Label>
                            <Input className="h-8 text-xs" placeholder="Campaign ID"
                              value={editForm.source_campaign_id}
                              onChange={(e) => setEditForm((f) => ({ ...f, source_campaign_id: e.target.value }))}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Campaign Date</Label>
                            <Input type="date" className="h-8 text-xs"
                              value={editForm.source_campaign_date}
                              onChange={(e) => setEditForm((f) => ({ ...f, source_campaign_date: e.target.value }))}
                            />
                          </div>
                        </div>
                      )}
                      <div className="grid gap-2">
                        <Label>Address</Label>
                        <Textarea
                          value={editForm.address}
                          onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Medical Information */}
                  <div className="rounded-xl border border-gray-100 dark:border-[#334155] p-4 mb-4">
                    <h4 className="text-sm font-semibold text-primary flex items-center gap-2 mb-3">
                      <Activity className="h-4 w-4" />
                      Medical Information
                    </h4>
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <Label>Diagnosis</Label>
                        <Textarea
                          value={editForm.diagnosis}
                          onChange={(e) => setEditForm((f) => ({ ...f, diagnosis: e.target.value }))}
                          placeholder="Enter diagnosis..."
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Medical History</Label>
                        <Textarea
                          value={editForm.medical_history}
                          onChange={(e) => setEditForm((f) => ({ ...f, medical_history: e.target.value }))}
                          placeholder="Enter medical history..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Vitals */}
                  <div className="rounded-xl border border-gray-100 dark:border-[#334155] p-4 mb-4">
                    <h4 className="text-sm font-semibold text-primary flex items-center gap-2 mb-3">
                      <Activity className="h-4 w-4" />
                      Vitals
                    </h4>
                    <div className="grid grid-cols-5 gap-3">
                      <div className="grid gap-1">
                        <Label className="text-xs">Height (cm)</Label>
                        <Input type="number" step="0.1" className="h-8 text-xs" value={editForm.height} onChange={(e) => setEditForm((f) => ({ ...f, height: e.target.value }))} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Weight (kg)</Label>
                        <Input type="number" step="0.1" className="h-8 text-xs" value={editForm.weight} onChange={(e) => setEditForm((f) => ({ ...f, weight: e.target.value }))} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">BP</Label>
                        <Input className="h-8 text-xs" placeholder="120/80" value={editForm.bp} onChange={(e) => setEditForm((f) => ({ ...f, bp: e.target.value }))} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Sugar</Label>
                        <Input className="h-8 text-xs" placeholder="mg/dL" value={editForm.sugar} onChange={(e) => setEditForm((f) => ({ ...f, sugar: e.target.value }))} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">SpO2 (%)</Label>
                        <Input type="number" step="0.1" className="h-8 text-xs" placeholder="98" value={editForm.spo2} onChange={(e) => setEditForm((f) => ({ ...f, spo2: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="rounded-xl border border-gray-100 dark:border-[#334155] p-4">
                    <h4 className="text-sm font-semibold text-primary flex items-center gap-2 mb-3">
                      <Activity className="h-4 w-4" />
                      Status
                    </h4>
                    <div className="grid gap-2">
                      <Label>Patient Status</Label>
                      <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                </DialogBody>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button
                    className="bg-primary hover:bg-primary-hover text-white"
                    onClick={() => {
                      const cleaned: Record<string, any> = {}
                      for (const [key, value] of Object.entries(editForm)) {
                        if (value === "" || value === null || value === undefined) continue
                        if (key === "age") cleaned[key] = Number(value)
                        else if (key === "height" || key === "weight") cleaned[key] = Number(value)
                        else cleaned[key] = value
                      }
                      updateMutation.mutate(cleaned)
                    }}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
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

      {/* Sticky Responsive Tab Navigation */}
      <div className="sticky top-[57px] z-20 bg-background border-b border-border -mx-6 px-6 mb-6 shadow-sm">
        <div
          ref={tabBarRef}
          className="flex items-center gap-1 overflow-x-auto scrollbar-hide scroll-smooth py-2.5"
          onWheel={(e) => {
            const el = e.currentTarget;
            if (el.scrollWidth > el.clientWidth) {
              el.scrollLeft += e.deltaY;
            }
          }}
          role="tablist"
          aria-label="Patient section navigation"
        >
          {tabs.map((tab) => {
            const count = tab.getCount?.();
            const isActive = activeTab === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={isActive}
                aria-label={`${tab.label}${count != null && count > 0 ? ` (${count})` : ""}`}
                data-active={isActive ? "true" : undefined}
                onClick={() => setActiveTab(tab.value)}
                className={`
                  relative flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium
                  whitespace-nowrap transition-all duration-200 min-h-[44px] flex-shrink-0
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                  ${isActive
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }
                `}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate max-w-[90px] sm:max-w-none">{tab.label}</span>
                {count != null && count > 0 && (
                  <span
                    className={`
                      inline-flex items-center justify-center rounded-full text-xs font-semibold
                      px-1.5 py-0.5 min-w-[20px] h-5 leading-none
                      ${isActive ? "bg-white/20 text-white" : "bg-muted/50 text-muted-foreground"}
                    `}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content - Lazy Loaded */}
      {activeTab === "overview" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
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
                  <dd className="font-medium">{patient.age ? `${patient.age} yrs` : "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">OP No.</dt>
                  <dd className="font-medium">{patient.op_no || "—"}</dd>
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
                {patient.patient_source && (
                  <>
                    <div className="border-t border-border my-2" />
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Acquisition Source</dt>
                      <dd className="font-medium">{patient.patient_source}</dd>
                    </div>
                    {patient.source_campaign_name && (
                      <div className="flex justify-between">
                        <dt className="text-text-secondary">Campaign Name</dt>
                        <dd className="font-medium">{patient.source_campaign_name}</dd>
                      </div>
                    )}
                    {patient.source_campaign_id && (
                      <div className="flex justify-between">
                        <dt className="text-text-secondary">Campaign ID</dt>
                        <dd className="font-medium">{patient.source_campaign_id}</dd>
                      </div>
                    )}
                    {patient.source_campaign_date && (
                      <div className="flex justify-between">
                        <dt className="text-text-secondary">Campaign Date</dt>
                        <dd className="font-medium">{patient.source_campaign_date}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </Card>

            <Card className="p-6 border-border shadow-card md:col-span-2">
              <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Vitals
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <div><span className="text-sm text-text-secondary">Height</span><p className="font-semibold">{patient.height ? `${patient.height} cm` : "—"}</p></div>
                <div><span className="text-sm text-text-secondary">Weight</span><p className="font-semibold">{patient.weight ? `${patient.weight} kg` : "—"}</p></div>
                <div><span className="text-sm text-text-secondary">BP</span><p className="font-semibold">{patient.bp || "—"}</p></div>
                <div><span className="text-sm text-text-secondary">Sugar</span><p className="font-semibold">{patient.sugar || "—"}</p></div>
                <div><span className="text-sm text-text-secondary">SpO2</span><p className="font-semibold">{patient.spo2 || "—"}</p></div>
              </div>
            </Card>
            {patient.diagnosis && (
              <Card className="p-6 border-border shadow-card md:col-span-2">
                <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Diagnosis
                </h3>
                <p className="text-text-secondary whitespace-pre-wrap">{patient.diagnosis}</p>
              </Card>
            )}
            <Card className="p-6 border-border shadow-card md:col-span-2">
              <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Medical History
              </h3>
              {patient.medical_history ? (
                <p className="text-text-secondary whitespace-pre-wrap">{patient.medical_history}</p>
              ) : (
                <p className="text-text-secondary italic">No medical history recorded</p>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === "cases" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
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
        </div>
      )}

      {activeTab === "appointments" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
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
        </div>
      )}

      {activeTab === "treatments" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
          {treatmentPlansList.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-card">
              <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No treatment plans found</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {treatmentPlansList.map((t: TreatmentPlan) => {
                const pending = t.pending_amount ?? (t.cost - (t.paid_amount || 0))
                return (
                  <Card
                    key={t.id}
                    className="p-4 border-border shadow-card card-hover cursor-pointer"
                    onClick={() => navigate(`/treatments/${t.id}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-text-primary truncate">{t.treatment_name}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                      <span>Cost: {formatIndianRupees(t.cost)}</span>
                      <span>Paid: <span className="text-success">{formatIndianRupees(t.paid_amount || 0)}</span></span>
                      <span>Pending: <span className="text-danger">{formatIndianRupees(pending)}</span></span>
                      {t.duration_minutes && <span>Duration: {t.duration_minutes} min</span>}
                    </div>
                    {t.total_sittings > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${t.progress}%` }} />
                        </div>
                        <span className="text-xs text-text-muted">{t.progress}%</span>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "billing" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
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
        </div>
      )}

      {activeTab === "responses" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <Card className="p-6 border-border shadow-card">
            <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Enquiry Responses ({followUpResponsesList.length})
            </h3>
            {followUpResponsesList.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare className="h-12 w-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">No responses recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Enquiry Type</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Response</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Feedback</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Follow-Up</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Appointment</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Doctor</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUpResponsesList.map((r: any) => {
                      const respColor: Record<string, string> = {
                        POSITIVE: "bg-green-100 text-green-700",
                        NEGATIVE: "bg-red-100 text-red-700",
                        NEEDS_ATTENTION: "bg-yellow-100 text-yellow-700",
                        COMPLAINT: "bg-orange-100 text-orange-700",
                        EMERGENCY: "bg-red-100 text-red-700",
                        NO_RESPONSE: "bg-gray-100 text-gray-500",
                        NOT_INTERESTED: "bg-gray-100 text-gray-600",
                      }
                      const fbColor: Record<string, string> = {
                        POSITIVE: "text-green-600",
                        NEGATIVE: "text-red-600",
                        NEUTRAL: "text-gray-500",
                      }
                      const typeLabel: Record<string, string> = {
                        "1_DAY_POST_TREATMENT": "1-Day Post Treatment",
                        "6_MONTH_RECALL": "6-Month Recall",
                        "MANUAL": "Manual Follow-Up",
                      }
                      return (
                        <tr key={r.id} className="border-b hover:bg-muted/50">
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            <span className="font-medium">{typeLabel[r.follow_up_type] || r.follow_up_type || "-"}</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs max-w-[200px] truncate">
                            {r.response_message || <span className="text-muted-foreground italic">No message</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${respColor[r.response_status] || "bg-gray-100 text-gray-600"}`}>
                              {r.response_status}
                            </span>
                          </td>
                          <td className={`px-3 py-2.5 text-xs font-medium ${fbColor[r.feedback] || ""}`}>
                            {r.feedback || "-"}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {r.follow_up_required ? (
                              <span className="text-green-600 font-medium">YES</span>
                            ) : (
                              <span className="text-muted-foreground">NO</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {r.appointment_id ? (
                              <span className="text-primary font-medium">APT-{r.appointment_id.slice(-5)}</span>
                            ) : "-"}
                          </td>
                          <td className="px-3 py-2.5 text-xs">Dr. {r.doctor_name || "-"}</td>
                          <td className="px-3 py-2.5 text-xs">{r.created_by_name || "-"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "follow-ups" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
          {followUpHistory && followUpHistory.length > 0 ? (
            <FollowUpHistory patientId={id!} />
          ) : (
            <Card className="p-12 text-center border-border shadow-card">
              <CalendarDays className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No follow-ups found</p>
            </Card>
          )}
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
          {renderTimeline()}
        </div>
      )}

      {activeTab === "images" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <div className="space-y-6">
            {casesList.length === 0 ? (
              <Card className="p-12 text-center border-border shadow-card">
                <Camera className="h-12 w-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">No cases found for this patient</p>
              </Card>
            ) : (
              casesList.map((caseItem: Case) => (
                <CaseImages key={caseItem.id} caseId={caseItem.id} caseName={`Case #${caseItem.id.slice(0, 8)}`} />
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "consent-forms" && (
        <div className="overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <ConsentFormsSection patientId={patient.id} />
        </div>
      )}
    </div>
  );
}

function ConsentFormsSection({ patientId }: { patientId: string }) {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { data, isLoading } = useQuery({
    queryKey: ["patient-consent-forms", patientId],
    queryFn: () => consentFormsApi.getByPatient(patientId),
    enabled: !!patientId,
  })

  const handleView = (id: string) => navigate(`/consent-forms/view/${id}`)
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
    } catch { addToast({ title: "Error", description: "Download failed", variant: "destructive" }) }
  }

  const items = Array.isArray(data) ? data : []
  return (
    <Card className="p-4">
      {isLoading ? (
        <p className="text-center py-4">Loading consent forms...</p>
      ) : items.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No consent forms for this patient</p>
      ) : (
        <div className="space-y-2">
          {items.map((cf: any) => (
            <div key={cf.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium text-sm">{cf.consent_type}</p>
                <p className="text-xs text-muted-foreground">{cf.created_at ? new Date(cf.created_at).toLocaleDateString() : ""} {cf.doctor_name ? `- ${cf.doctor_name}` : ""}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleView(cf.id)}>View</Button>
                <Button variant="ghost" size="sm" onClick={() => handleDownload(cf.id)}>Download</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function CaseImages({ caseId, caseName }: { caseId: string; caseName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [activeSection, setActiveSection] = useState<string>("preop");

  const { data: preOps } = useQuery({
    queryKey: ["case-preops", caseId],
    queryFn: async () => {
      const r = await api.get(`/pre-ops/${caseId}`);
      return r.data;
    },
  });

  const { data: postOps } = useQuery({
    queryKey: ["case-postops", caseId],
    queryFn: async () => {
      const r = await api.get(`/post-ops/${caseId}`);
      return r.data;
    },
  });

  const preOpPhotos = preOps?.photo_urls
    ? preOps.photo_urls.split(",").filter(Boolean)
    : [];
  const preOpXrays = preOps?.xray_urls
    ? preOps.xray_urls.split(",").filter(Boolean)
    : [];
  const postOpPhotos = postOps?.photo_urls
    ? postOps.photo_urls.split(",").filter(Boolean)
    : [];

  const hasAny = preOpPhotos.length > 0 || preOpXrays.length > 0 || postOpPhotos.length > 0;
  if (!hasAny) return null;

  const sections = [
    { key: "preop", label: `Pre-Op (${preOpPhotos.length})`, photos: preOpPhotos },
    { key: "xray", label: `X-Ray (${preOpXrays.length})`, photos: preOpXrays },
    { key: "postop", label: `Post-Op (${postOpPhotos.length})`, photos: postOpPhotos },
  ].filter((s) => s.photos.length > 0);

  const activePhotos = sections.find((s) => s.key === activeSection)?.photos || [];

  return (
    <Card className="p-4 border-border shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Camera className="h-4 w-4 text-primary" />
        <h4 className="font-medium text-text-primary truncate">{caseName}</h4>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {sections.map((s) => (
          <Button
            key={s.key}
            variant={activeSection === s.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </div>
      {activePhotos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {activePhotos.map((url: string, i: number) => (
            <img
              key={i}
              src={url}
              alt={`${activeSection} ${i + 1}`}
              className="w-full h-28 object-cover rounded-lg cursor-pointer"
              onClick={() => setPreviewUrl(url)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={() => { setPreviewUrl(null); setZoom(1) }}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh]">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Image Preview</DialogTitle>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-2">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="icon-sm" onClick={() => setZoom(z => Math.min(z + 0.25, 5))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => setZoom(1)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          {previewUrl && (
            <div
              className="flex items-center justify-center overflow-auto max-h-[70vh] bg-gray-100 dark:bg-gray-900 rounded-lg cursor-grab active:cursor-grabbing select-none"
              onWheel={(e) => {
                e.preventDefault()
                setZoom(z => {
                  const delta = e.deltaY > 0 ? -0.1 : 0.1
                  return Math.max(0.25, Math.min(5, z + delta))
                })
              }}
              onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
            >
              <img
                src={previewUrl}
                alt="Preview"
                className="transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
                draggable={false}
                loading="lazy"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function FollowUpHistory({ patientId }: { patientId: string }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["patient-follow-up-history", patientId],
    queryFn: () => crmApi.patientFollowUpHistory(patientId),
    enabled: !!patientId,
  })
  const items: any[] = history || []

  if (isLoading) return <Card className="p-12 text-center border-border shadow-card"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></Card>

  if (items.length === 0) return (
    <Card className="p-12 text-center border-border shadow-card">
      <CalendarDays className="h-12 w-12 text-text-muted mx-auto mb-3" />
      <p className="text-text-secondary">No follow-up history found</p>
    </Card>
  )

  return (
    <div className="space-y-3">
      {items.map((f: any) => (
        <Card key={f.id} className="p-4 border-border shadow-card">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-text-primary">
              {f.follow_up_type === "1_DAY_POST_TREATMENT" ? "1-Day Post Treatment" :
               f.follow_up_type === "6_MONTH_RECALL" ? "6-Month Recall" : "Manual"}
            </span>
            <Badge className={`text-xs ${
              f.status === "COMPLETED" ? "bg-green-50 text-green-700" :
              f.status === "SCHEDULED" ? "bg-blue-50 text-blue-700" :
              f.status === "PENDING" ? "bg-yellow-50 text-yellow-700" :
              "bg-gray-50 text-gray-600"
            }`}>{f.status}</Badge>
            {f.doctor_name && <span className="text-xs text-text-secondary">Dr. {f.doctor_name}</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-text-secondary">Created</p>
              <p className="font-medium">{new Date(f.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Due Date</p>
              <p className="font-medium">{new Date(f.follow_up_date).toLocaleDateString()}</p>
            </div>
            {f.completed_date && (
              <div>
                <p className="text-xs text-text-secondary">Completed</p>
                <p className="font-medium">{new Date(f.completed_date).toLocaleDateString()}</p>
              </div>
            )}
            {f.treatment_name && (
              <div>
                <p className="text-xs text-text-secondary">Treatment</p>
                <p className="font-medium">{f.treatment_name}</p>
              </div>
            )}
          </div>
          {f.notes && <p className="mt-2 text-sm text-text-secondary">{f.notes}</p>}
          {f.communications && f.communications.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs font-semibold text-text-secondary mb-2">Communication History</p>
              <div className="space-y-2">
                {f.communications.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs text-text-secondary">
                    <Badge className={`text-xs ${c.channel === "WHATSAPP" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                      {c.channel}
                    </Badge>
                    <span className="truncate">{c.message}</span>
                    <span className="ml-auto">{c.sent_at ? new Date(c.sent_at).toLocaleString() : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
