import { type UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import type { SettingsSchema } from "./schemas";

export type SettingsFormValues = z.infer<typeof SettingsSchema>;

export interface SettingsContext {
  form: UseFormReturn<SettingsFormValues>;
  hasChanges: boolean;
  isSaving: boolean;
  handleSave: () => Promise<void>;
  handleReset: () => void;
  setActiveTab: (tab: string) => void;
}

export interface SettingsFieldProps {
  label: string;
  description?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
  className?: string;
  disabled?: boolean;
}

export interface SettingsNumberInputProps {
  value: number;
  onChange: (val: number | "") => void;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

export interface SettingsDropdownProps {
  value: string;
  onValueChange: (val: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export interface SettingsSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}
