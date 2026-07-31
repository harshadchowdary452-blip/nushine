const OVERRIDE_KEY = "hospital-override"

export function getHospitalOverride(): string | null {
  return localStorage.getItem(OVERRIDE_KEY)
}

export function setHospitalOverride(hospitalId: string | null): void {
  if (hospitalId) localStorage.setItem(OVERRIDE_KEY, hospitalId)
  else localStorage.removeItem(OVERRIDE_KEY)
}
