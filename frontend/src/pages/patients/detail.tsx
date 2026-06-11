import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { ArrowLeft, Mail, Phone, Calendar, MapPin, LayoutDashboard, FolderOpen, CalendarDays, Stethoscope, Receipt } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import PageHeader from "@/components/layout/page-header"
import { patientsApi, casesApi } from "@/services/endpoints"
import type { Patient, Case } from "@/types"

const statusBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  OPEN: "default",
  IN_DIAGNOSIS: "warning",
  IN_TREATMENT: "secondary",
  FOLLOW_UP: "outline",
  CLOSED: "success",
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["patient", id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  })

  const { data: cases } = useQuery({
    queryKey: ["patient-cases", id],
    queryFn: () => casesApi.list({ patient_id: id }),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Patient not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/patients")}>
          Back to Patients
        </Button>
      </div>
    )
  }

  const initials = patient.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const casesList: Case[] = cases?.items || cases || []

  return (
    <div className="space-y-6">
      <PageHeader title="">
        <Button variant="outline" onClick={() => navigate("/patients")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold">{patient.full_name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {patient.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" /> {patient.email}
                    </span>
                  )}
                  {patient.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {patient.phone}
                    </span>
                  )}
                  {patient.gender && (
                    <Badge variant="outline">{patient.gender}</Badge>
                  )}
                  {patient.age && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {patient.age} yrs
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Badge variant={patient.is_active ? "success" : "secondary"}>
              {patient.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="cases"><FolderOpen className="h-4 w-4" />Cases</TabsTrigger>
          <TabsTrigger value="appointments"><CalendarDays className="h-4 w-4" />Appointments</TabsTrigger>
          <TabsTrigger value="treatment-plans"><Stethoscope className="h-4 w-4" />Treatment Plans</TabsTrigger>
          <TabsTrigger value="billing"><Receipt className="h-4 w-4" />Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium">{patient.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Gender</p>
                  <p className="font-medium">{patient.gender || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Age</p>
                  <p className="font-medium">{patient.age ?? "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date of Birth</p>
                  <p className="font-medium">
                    {patient.date_of_birth
                      ? format(new Date(patient.date_of_birth), "MMM dd, yyyy")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{patient.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{patient.email || "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {patient.address || "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Medical History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {patient.medical_history || "No medical history recorded."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cases" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cases ({casesList.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {casesList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cases found.</p>
              ) : (
                <div className="space-y-3">
                  {casesList.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/cases/${c.id}`)}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{c.chief_complaint}</p>
                        <p className="text-xs text-muted-foreground">
                          Created {format(new Date(c.created_at), "MMM dd, yyyy")}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant[c.status] || "default"}>
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Appointments will be displayed here.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="treatment-plans" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Treatment plans will be displayed here.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Billing information will be displayed here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
