import { useQuery } from "@tanstack/react-query"
import { billingApi } from "@/services/endpoints"

export interface UnbilledOutstanding {
  case_id: string
  case_number?: string | null
  patient_id: string | null
  patient_name: string | null
  op_no?: string | null
  hospital_id?: string | null
  hospital_name?: string | null
  doctor_id?: string | null
  doctor_name?: string | null
  treatment_names: string[]
  outstanding_balance: number
  payment_status?: string | null
}

interface UnbilledResponse {
  items: UnbilledOutstanding[]
  total: number
}

/**
 * Completed-but-uninvoiced treatments (₹0 billed) surfaced by
 * GET /billings/unbilled. Used by the billing tab KPIs and the role
 * dashboards' AlertCenter.
 */
export function useUnbilledBilling(params?: { hospital_id?: string }) {
  const query = useQuery<UnbilledResponse>({
    queryKey: ["billings-unbilled", params?.hospital_id],
    queryFn: () => billingApi.unbilled({ page_size: 100, ...params }),
    staleTime: 30000,
    gcTime: 120000,
  })

  const items = query.data?.items ?? []
  const total = items.reduce((sum, u) => sum + (u.outstanding_balance || 0), 0)

  return { ...query, items, total }
}
