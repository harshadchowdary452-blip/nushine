import axios from 'axios';
import {
  SuperAdminDashboard,
  GroupAdminDashboard,
  HospitalAdminDashboard,
  DoctorDashboard,
} from '../types/dashboard';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const dashboardService = {
  getSuperAdminDashboard: async (): Promise<SuperAdminDashboard> => {
    const response = await api.get('/dashboards/super-admin');
    return response.data;
  },

  getGroupAdminDashboard: async (): Promise<GroupAdminDashboard> => {
    const response = await api.get('/dashboards/group-admin');
    return response.data;
  },

  getHospitalAdminDashboard: async (): Promise<HospitalAdminDashboard> => {
    const response = await api.get('/dashboards/hospital-admin');
    return response.data;
  },

  getDoctorDashboard: async (): Promise<DoctorDashboard> => {
    const response = await api.get('/dashboards/doctor');
    return response.data;
  },

  getBillingPDF: async (billingId: string): Promise<Blob> => {
    const response = await api.get(`/billings/${billingId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },

  downloadBillingPDF: (billingId: string, filename?: string) => {
    dashboardService.getBillingPDF(billingId).then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `invoice-${billingId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    });
  },
};

export default dashboardService;
