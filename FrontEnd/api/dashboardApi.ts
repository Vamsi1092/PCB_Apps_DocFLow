const API_BASE_URL = 'http://127.0.0.1:8000';

export type KpiAccentValue = 'default' | 'red' | 'green';

export type DashboardDateFilter = 'today' | 'week' | 'month' | 'last100' | 'custom';

export interface DashboardKpisParams {
  dateFilter: DashboardDateFilter;
  startDate?: string;
  endDate?: string;
}

export interface DashboardKpi {
  key: string;
  label: string;
  value: string;
  trend: string;
  accent: KpiAccentValue;
}

export interface DashboardKpisResponse {
  success: boolean;
  message: string;
  kpis: DashboardKpi[];
  error?: string;
}

interface DashboardKpiMetric {
  count: number;
  change: number;
}

interface DashboardKpisData {
  dateFilter: string;
  startDate: string | null;
  endDate: string | null;
  activeInvoices: DashboardKpiMetric;
  pendingReview: DashboardKpiMetric;
  openExceptions: DashboardKpiMetric;
  pendingApprovals: DashboardKpiMetric;
  postingReady: DashboardKpiMetric;
  slaBreached: DashboardKpiMetric;
}

interface RawDashboardKpisResponse {
  success: boolean;
  message: string;
  data: DashboardKpisData | null;
  error?: string;
}

const KPI_FIELD_MAP: Array<{
  field: keyof Omit<DashboardKpisData, 'dateFilter' | 'startDate' | 'endDate'>;
  key: string;
  label: string;
  accent: KpiAccentValue;
}> = [
  { field: 'activeInvoices', key: 'active_invoices', label: 'Active Invoices', accent: 'default' },
  { field: 'pendingReview', key: 'pending_review', label: 'Pending Review', accent: 'default' },
  { field: 'openExceptions', key: 'open_exceptions', label: 'Open Exceptions', accent: 'red' },
  { field: 'pendingApprovals', key: 'pending_approvals', label: 'Pending Approvals', accent: 'default' },
  { field: 'postingReady', key: 'posting_ready', label: 'Posting Ready', accent: 'green' },
  { field: 'slaBreached', key: 'sla_breached', label: 'SLA Breached', accent: 'red' },
];

function formatTrend(change: number): string {
  if (change > 0) return `+${change.toFixed(1)}%`;
  if (change < 0) return `−${Math.abs(change).toFixed(1)}%`;
  return '0%';
}

function toDashboardKpis(data: DashboardKpisData): DashboardKpi[] {
  return KPI_FIELD_MAP.map(({ field, key, label, accent }) => ({
    key,
    label,
    value: data[field].count.toLocaleString('en-US'),
    trend: formatTrend(data[field].change),
    accent,
  }));
}

export async function getDashboardKpis(params: DashboardKpisParams): Promise<DashboardKpisResponse> {
  const query = new URLSearchParams({ dateFilter: params.dateFilter });
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);

  const response = await fetch(`${API_BASE_URL}/api/dashboard/kpis?${query.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard KPIs: ${response.status} ${response.statusText}`);
  }

  const result: RawDashboardKpisResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || result.message || 'Failed to fetch dashboard KPIs');
  }

  return {
    success: result.success,
    message: result.message,
    kpis: toDashboardKpis(result.data),
  };
}

export interface DashboardPipelineStage {
  name: string;
  count: number;
}

export interface DashboardPipelineData {
  dateFilter: string;
  startDate: string | null;
  endDate: string | null;
  label: string;
  totalIngested: number;
  stages: DashboardPipelineStage[];
}

interface RawDashboardPipelineResponse {
  success: boolean;
  message: string;
  data: DashboardPipelineData | null;
  error?: string;
}

export async function getDashboardPipeline(params: DashboardKpisParams): Promise<DashboardPipelineData> {
  const query = new URLSearchParams({ dateFilter: params.dateFilter });
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);

  const response = await fetch(`${API_BASE_URL}/api/dashboard/pipeline?${query.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard pipeline: ${response.status} ${response.statusText}`);
  }

  const result: RawDashboardPipelineResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || result.message || 'Failed to fetch dashboard pipeline');
  }

  return result.data;
}
