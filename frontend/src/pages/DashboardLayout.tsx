import React from 'react';
import { useAuthStore } from '../store/useAuthStore';
import SuperAdminDashboard from './SuperAdminDashboard';
import GroupAdminDashboard from './GroupAdminDashboard';
import HospitalAdminDashboard from './HospitalAdminDashboard';
import DoctorDashboard from './DoctorDashboard';

export const DashboardLayout: React.FC = () => {
  const { user } = useAuthStore();

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Please log in to view your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {user.role === 'SUPER_ADMIN' && <SuperAdminDashboard />}
        {user.role === 'GROUP_ADMIN' && <GroupAdminDashboard />}
        {user.role === 'HOSPITAL_ADMIN' && <HospitalAdminDashboard />}
        {user.role === 'DOCTOR' && <DoctorDashboard />}
      </div>
    </div>
  );
};

export default DashboardLayout;