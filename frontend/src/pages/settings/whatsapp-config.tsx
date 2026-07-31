import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Save, Smartphone, Globe, ToggleRight, Info } from "lucide-react"
import { PageHeader } from "@/design-system"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { useAuthStore } from "@/store/authStore"
import { whatsappConfigApi } from "@/services/endpoints"

export default function WhatsAppConfigPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const hospitalId = user?.hospital_id || ""

  const [enabled, setEnabled] = useState(false)
  const [whatsappMode, setWhatsappMode] = useState("LIVE")
  const [clinicNumber, setClinicNumber] = useState("")
  const [countryCode, setCountryCode] = useState("+91")
  const [defaultTemplates, setDefaultTemplates] = useState(true)
  const [broadcastEnabled, setBroadcastEnabled] = useState(false)
  const [campaignEnabled, setCampaignEnabled] = useState(false)

  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp-config", hospitalId],
    queryFn: () => whatsappConfigApi.get(hospitalId),
    enabled: !!hospitalId,
  })

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled)
      setWhatsappMode(config.whatsapp_mode || "LIVE")
      setClinicNumber(config.clinic_whatsapp_number || "")
      setCountryCode(config.country_code)
      setDefaultTemplates(config.default_message_templates_enabled)
      setBroadcastEnabled(config.broadcast_enabled)
      setCampaignEnabled(config.campaign_enabled)
    }
  }, [config])

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => whatsappConfigApi.update(hospitalId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-config", hospitalId] })
      addToast({ title: "WhatsApp configuration saved", variant: "success" })
    },
    onError: () =>
      addToast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      }),
  })

  function handleSave() {
    updateMutation.mutate({
      enabled,
      whatsapp_mode: whatsappMode,
      clinic_whatsapp_number: clinicNumber || null,
      country_code: countryCode,
      default_message_templates_enabled: defaultTemplates,
      broadcast_enabled: broadcastEnabled,
      campaign_enabled: campaignEnabled,
    })
  }

  if (!hospitalId) return <div className="p-4 text-[var(--ds-text-secondary)]">No hospital selected</div>
  if (isLoading)
    return (
      <div className="space-y-4 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        title="WhatsApp Configuration"
        description="Configure your clinic WhatsApp integration"
        actions={
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-1.5" /> {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Smartphone className="h-4 w-4 text-primary" /> WhatsApp Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-[var(--ds-border)] p-4">
            <div>
              <p className="font-medium text-[var(--ds-text)]">Enable WhatsApp</p>
              <p className="text-sm text-[var(--ds-text-secondary)]">Turn on WhatsApp messaging for this clinic</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[var(--ds-border)] p-4">
            <div>
              <p className="font-medium text-[var(--ds-text)]">WhatsApp Mode</p>
              <p className="text-sm text-[var(--ds-text-secondary)]">LIVE for production, SANDBOX for testing</p>
            </div>
            <select
              value={whatsappMode}
              onChange={(e) => setWhatsappMode(e.target.value)}
              className="h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 text-sm outline-none focus:border-primary"
            >
              <option value="LIVE">Live</option>
              <option value="SANDBOX">Sandbox</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Country Code</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-[var(--ds-text-tertiary)]" />
                <Input
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="pl-9"
                  placeholder="+91"
                />
              </div>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Clinic WhatsApp Number</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-[var(--ds-text-tertiary)]" />
                <Input
                  value={clinicNumber}
                  onChange={(e) => setClinicNumber(e.target.value)}
                  className="pl-9"
                  placeholder="9876543210"
                />
              </div>
              <p className="text-xs text-[var(--ds-text-tertiary)]">
                Enter number without country code (e.g. 9876543210)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ToggleRight className="h-4 w-4 text-primary" /> Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-[var(--ds-border)] p-4">
            <div>
              <p className="font-medium text-[var(--ds-text)]">Default Message Templates</p>
              <p className="text-sm text-[var(--ds-text-secondary)]">
                Enable pre-built message templates for common scenarios
              </p>
            </div>
            <Switch checked={defaultTemplates} onCheckedChange={setDefaultTemplates} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--ds-border)] p-4">
            <div>
              <p className="font-medium text-[var(--ds-text)]">Broadcast Messaging</p>
              <p className="text-sm text-[var(--ds-text-secondary)]">
                Allow sending bulk WhatsApp messages to patients
              </p>
            </div>
            <Switch checked={broadcastEnabled} onCheckedChange={setBroadcastEnabled} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--ds-border)] p-4">
            <div>
              <p className="font-medium text-[var(--ds-text)]">Campaign Messaging</p>
              <p className="text-sm text-[var(--ds-text-secondary)]">
                Allow WhatsApp campaigns (promotions, awareness)
              </p>
            </div>
            <Switch checked={campaignEnabled} onCheckedChange={setCampaignEnabled} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How WhatsApp Messaging Works</p>
            <p>
              This MVP uses WhatsApp deep links (<code>wa.me</code>) to open WhatsApp with
              pre-filled messages. No API integration or messaging costs required. Staff can send
              messages through their clinic WhatsApp number.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
