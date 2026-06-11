import React from 'react';
import { useQuery } from '@tanstack/react-query';
import dashboardService from '../../services/dashboardService';
import { MetricCard, SimpleBarChart } from '../Charts/ChartComponents';

export const HospitalAdminDashboard: React.FC = () => {
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'hospital-admin'],
    queryFn: dashboardService.getHospitalAdminDashboard,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading hospital dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Error loading dashboard. Please refresh.</p>
      </div>
    );
  }

  if (!dashboardData) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Hospital Dashboard</h1>
        <p className="text-gray-600 mt-1">Hospital Performance & Operations</p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Today's Appointments"
          value={dashboardData.today_appointments}
          icon="📅"
        />
        <MetricCard
          label="Total Revenue"
          value={dashboardData.total_revenue}
          currency={true}
        />
        <MetricCard
          label="Total Patients"
          value={dashboardData.total_patients}
          icon="👥"
        />
        <MetricCard
          label="Active Cases"
          value={dashboardData.total_cases}
          icon="📋"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart
          title="Top Doctors by Revenue"
          data={dashboardData.top_doctors}
          height={350}
        />
        <SimpleBarChart
          title="Treatment Services"
          data={dashboardData.top_treatments}
          height={350}
        />
      </div>
    </div>
  );
};

export default HospitalAdminDashboard;