import { create } from "zustand";

interface HospitalState {
  selectedHospitalId: string | null;
  setSelectedHospitalId: (id: string | null) => void;
  clearSelection: () => void;
}

export const useHospitalStore = create<HospitalState>((set) => ({
  selectedHospitalId: null,
  setSelectedHospitalId: (id) => set({ selectedHospitalId: id }),
  clearSelection: () => set({ selectedHospitalId: null }),
}));
