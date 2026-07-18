import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmV2Api } from "@/services/endpoints";

export function useFollowUpTemplates(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["crm-v2", "templates", params],
    queryFn: () => crmV2Api.templates.list(params),
  });
}

export function useAutomationRules(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["crm-v2", "rules", params],
    queryFn: () => crmV2Api.rules.list(params),
  });
}

export function useCrmDashboard() {
  return useQuery({
    queryKey: ["crm-v2", "dashboard"],
    queryFn: () => crmV2Api.dashboard(),
    refetchInterval: 60000,
  });
}

export function useCrmPerformanceReport(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["crm-v2", "reports", "performance", params],
    queryFn: () => crmV2Api.reports.performance(params),
  });
}

export function useCrmRecallReport(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["crm-v2", "reports", "recall-effectiveness", params],
    queryFn: () => crmV2Api.reports.recallEffectiveness(params),
  });
}

export function usePatientCrmTimeline(patientId: string | null) {
  return useQuery({
    queryKey: ["crm-v2", "patient-timeline", patientId],
    queryFn: () => crmV2Api.patientTimeline(patientId!),
    enabled: !!patientId,
  });
}

export function useEscalateFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmV2Api.escalate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-v2"] });
    },
  });
}
