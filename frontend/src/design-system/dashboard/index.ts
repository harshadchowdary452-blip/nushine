/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD SYSTEM — Part 3B-1 Enterprise Dashboard primitives
   ═══════════════════════════════════════════════════════════════════════════ */

// Period + filter
export { PERIOD_PRESETS, periodLabel, previousPeriodLabel, resolvePeriodRange, formatPeriodRange } from "./period"
export type { DashboardPeriod, PeriodPreset, PeriodRange } from "./period"
export { useDashboardFilter } from "./use-dashboard-filter"
export type { DashboardFilter } from "./use-dashboard-filter"

// Shells
export { DashboardShell, DashboardHeader, CommandCenter, WidgetCard, DashboardSection } from "./shell"
export type { DashboardHeaderProps, CommandCenterProps, WidgetCardProps, DashboardSectionProps } from "./shell"

// KPI
export { EnterpriseKpi, KpiGrid, formatChange, changeIsPositive } from "./kpi"
export type { KpiDatum, KpiGridProps, KpiTone } from "./kpi"

// Widgets
export { AlertCenter } from "./alerts"
export type { AlertItem, AlertSeverity, AlertCenterProps } from "./alerts"
export { QuickActionCenter } from "./quick-actions"
export type { QuickAction, QuickActionCenterProps } from "./quick-actions"
export { BusinessInsights } from "./insights"
export type { Insight, InsightTone, BusinessInsightsProps } from "./insights"
export { RecentActivity } from "./activity"
export type { ActivityEvent, ActivityTone, RecentActivityProps } from "./activity"
export { DepartmentPerformance } from "./performance"
export type { PerformerDatum, DepartmentPerformanceProps } from "./performance"

// Charts
export { DashboardChart, DonutChart, downloadCSV, DefaultTooltip, ChartStateBlock } from "./charts"
export type { ChartSeries, DashboardChartProps, DonutChartProps, DonutDatum, ChartPoint } from "./charts"

// Enterprise chart family
export { StackedBarChart, RadarChartComponent as RadarChart, HeatmapChart, ChartExport, printRows } from "./enterprise-charts"
export type {
  StackedBarChartProps, RadarChartProps, HeatmapChartProps, HeatmapDatum, ChartExportProps,
} from "./enterprise-charts"

// Personalization
export { useDashboardPersonalization, DashboardWidget, SavedViewsMenu } from "./personalization"
export type { DashboardPersonalization, DashboardWidgetProps, SavedViewsMenuProps } from "./personalization"

// Shared BI insights grid (cascades the enterprise charts to every role)
export { BiInsightsGrid, BI_INSIGHTS_WIDGETS } from "./bi-insights"
export type { BiInsightsGridProps, BiInsightsStats } from "./bi-insights"

// Narrative summary
export { ExecutiveSummary, buildSummaryTone, buildLeadSentence } from "./executive-summary"
export type { ExecutiveSummaryProps, SummaryMetric, SummaryHighlight, SummaryTone } from "./executive-summary"
