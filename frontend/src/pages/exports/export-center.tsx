import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { useAuthStore } from "@/store/authStore"
import {
  Download, FileSpreadsheet, FileText, Calendar,
  Loader2, Clock, Search,
  Users, FolderOpen, Activity, Receipt, Bell, BarChart3,
  UserPlus, CalendarDays, Stethoscope, IndianRupee, File as FilePdf,
} from "lucide-react"
import { exportsApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import PageHeader from "@/components/layout/page-header"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator";

const QUICK_FILTERS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "last_7_days" },
  { label: "Last 30 Days", value: "last_30_days" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "This Quarter", value: "this_quarter" },
  { label: "This Year", value: "this_year" },
];

const FORMAT_ICONS: Record<string, React.ElementType> = {
  csv: FileSpreadsheet,
  excel: FileSpreadsheet,
  pdf: FilePdf,
};

const FORMAT_COLORS: Record<string, string> = {
  csv: "text-green-600 bg-green-50 border-green-200",
  excel: "text-emerald-600 bg-emerald-50 border-emerald-200",
  pdf: "text-red-600 bg-red-50 border-red-200",
};

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export default function ExportCenter() {
  const { addToast } = useToast();
  const { user } = useAuthStore();
  const isHospitalAdmin = user?.role === "HOSPITAL_ADMIN";
  const [selectedModule, setSelectedModule] = useState("patients");
  const [selectedFormat, setSelectedFormat] = useState("csv");
  const [period, setPeriod] = useState("this_month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: modulesData } = useQuery({
    queryKey: ["export-modules"],
    queryFn: () => exportsApi.listModules(),
  });

  const modules = modulesData?.modules || [];

  const hiddenModules = isHospitalAdmin
    ? ["enquiries", "follow-ups", "recalls", "doctors", "consent-forms"]
    : [];

  const visibleModules = modules.filter((m: { id: string }) => !hiddenModules.includes(m.id));

  const filteredModules = searchQuery
    ? visibleModules.filter((m: { id: string; label: string }) => m.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : visibleModules;

  const getParams = () => {
    const params: Record<string, string> = { period };
    if (period === "custom") {
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
    }
    return params;
  };

  const exportMutation = useMutation({
    mutationFn: async () => {
      const params = getParams();
      const blob = await exportsApi.exportData(selectedModule, selectedFormat, params);
      return { blob, label: modules.find((m: { id: string; label: string }) => m.id === selectedModule)?.label || selectedModule };
    },
    onSuccess: ({ blob, label }) => {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
      downloadBlob(blob, `${label.toLowerCase().replace(/\s+/g, "_")}_${dateStr}.${selectedFormat}`);
      addToast({ title: "Export Complete", description: `${label} exported as ${selectedFormat.toUpperCase()}`, variant: "success" });
    },
    onError: () => {
      addToast({ title: "Export Failed", description: "Failed to export data", variant: "destructive" });
    },
  });

  const handleExport = () => {
    exportMutation.mutate();
  };

  const disabled = exportMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export Center"
        description="Export operational, clinical, CRM and financial data"
      />

      <Tabs defaultValue="quick" className="space-y-6">
        <TabsList>
          <TabsTrigger value="quick">Quick Export</TabsTrigger>
          {!isHospitalAdmin && <TabsTrigger value="reports">Dashboard Reports</TabsTrigger>}
        </TabsList>

        <TabsContent value="quick" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
                <CardDescription>Set date range and format</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Quick Date Filter</Label>
                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUICK_FILTERS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {period === "custom" && (
                  <>
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  </>
                )}
                <Separator />
                <div className="space-y-2">
                  <Label>Export Format</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {["csv", "excel", "pdf"].map((fmt) => {
                      const Icon = FORMAT_ICONS[fmt] || FileText;
                      return (
                        <Button
                          key={fmt}
                          variant={selectedFormat === fmt ? "default" : "outline"}
                          className={selectedFormat === fmt ? "" : FORMAT_COLORS[fmt]}
                          onClick={() => setSelectedFormat(fmt)}
                        >
                          <Icon className="w-4 h-4 mr-1" />
                          {fmt.toUpperCase()}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="pt-2">
                  <Button
                    className="w-full"
                    onClick={handleExport}
                    disabled={disabled}
                  >
                    {exportMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" /> Export Now</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Select Module</CardTitle>
                  <CardDescription>Choose the data module to export</CardDescription>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search modules..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {filteredModules.map((mod: { id: string; label: string }) => {
                      const isSelected = selectedModule === mod.id;
                      const IconMap: Record<string, React.ElementType> = {
                        patients: Users, appointments: CalendarDays, cases: FolderOpen,
                        treatments: Activity, billings: Receipt, expenses: IndianRupee,
                        leads: UserPlus, enquiries: Calendar, "follow-ups": Clock,
                        recalls: Bell, doctors: Stethoscope, "consent-forms": FileText,
                      };
                      const Icon = IconMap[mod.id] || FileText;
                      return (
                        <motion.button
                          key={mod.id}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setSelectedModule(mod.id)}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-md"
                              : "border-border hover:border-primary/50 hover:bg-accent"
                          }`}
                        >
                          <Icon className={`w-8 h-8 mb-2 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          <p className="font-medium text-sm">{mod.label}</p>
                        </motion.button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {!isHospitalAdmin && (
        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Dashboard Report
                </CardTitle>
                <CardDescription>
                  Hospital dashboard PDF with revenue, appointments, patient growth, and charts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExportReportButton
                  label="Export Dashboard PDF"
                  fetcher={(params) => exportsApi.exportDashboardPdf(params)}
                  filename="dashboard_report"
                />
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="w-5 h-5 text-primary" />
                  Financial Report
                </CardTitle>
                <CardDescription>
                  Revenue, collections, outstanding, expenses, net profit, and doctor revenue breakdown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExportReportButton
                  label="Export Financial PDF"
                  fetcher={(params) => exportsApi.exportFinancialPdf(params)}
                  filename="financial_report"
                />
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Monthly Management Report
                </CardTitle>
                <CardDescription>
                  Executive summary, revenue, patients, appointments, treatments, CRM and recall summary
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExportReportButton
                  label="Export Monthly PDF"
                  fetcher={(params) => exportsApi.exportMonthlyPdf(params)}
                  filename="monthly_report"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}


      </Tabs>
    </div>
  );
}

function ExportReportButton({ label, fetcher, filename }: {
  label: string;
  fetcher: (params?: Record<string, string>) => Promise<Blob>;
  filename: string;
}) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const blob = await fetcher();
      const dateStr = new Date().toISOString().slice(0, 7);
      downloadBlob(blob, `${filename}_${dateStr}.pdf`);
      addToast({ title: "Report Generated", description: `${filename} exported successfully`, variant: "success" });
    } catch {
      addToast({ title: "Export Failed", description: "Failed to generate report", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button className="w-full" onClick={handleExport} disabled={loading}>
      {loading ? (
        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
      ) : (
        <><FilePdf className="w-4 h-4 mr-2" /> {label}</>
      )}
    </Button>
  );
}


