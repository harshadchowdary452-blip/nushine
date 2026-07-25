import * as React from "react";
import { cn } from "@/lib/utils";

interface SettingsNumberInputProps {
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

export function SettingsNumberInput({
  value,
  onChange,
  min = 0,
  max = 999,
  suffix,
  disabled,
  className,
  id,
  ariaLabel,
}: SettingsNumberInputProps) {
  const [raw, setRaw] = React.useState(String(value));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "" || v === "-") {
      setRaw(v);
      return;
    }
    const num = Number(v);
    if (!isNaN(num)) {
      setRaw(v);
      onChange(num);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const num = Number(raw);
    if (isNaN(num) || raw === "") {
      onChange(min);
      setRaw(String(min));
    } else {
      const clamped = Math.min(max, Math.max(min, num));
      onChange(clamped);
      setRaw(String(clamped));
    }
  };

  return (
    <div className={cn("relative flex items-center", className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel}
        value={focused ? raw : String(value)}
        onChange={handleChange}
        onFocus={() => { setFocused(true); setRaw(String(value)); }}
        onBlur={handleBlur}
        className={cn(
          "h-9 w-full rounded-lg border text-sm text-right tabular-nums transition-all",
          "placeholder:text-[var(--color-text-muted)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-bg)]",
          "border-[var(--color-border)] bg-white hover:border-slate-300",
          suffix ? "pr-12" : "pr-3",
          "pl-3"
        )}
      />
      {suffix && (
        <span className="absolute right-3 text-xs font-medium text-[var(--color-text-muted)] pointer-events-none select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

interface SettingsTextInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  multiline?: boolean;
}

export function SettingsTextInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  id,
  multiline,
}: SettingsTextInputProps) {
  if (multiline) {
    return (
      <textarea
        id={id}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={cn(
          "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm",
          "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
          "hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-bg)]",
          "transition-all resize-none",
          className
        )}
      />
    );
  }

  return (
    <input
      id={id}
      type="text"
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm",
        "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
        "hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-bg)]",
        "transition-all",
        className
      )}
    />
  );
}

interface SettingsDropdownProps {
  value: string;
  onValueChange: (val: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function SettingsDropdown({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  disabled,
  className,
  id,
}: SettingsDropdownProps) {
  return (
    <select
      id={id}
      disabled={disabled}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(
        "h-9 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm",
        "text-[var(--color-text-primary)] appearance-none cursor-pointer",
        "hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-bg)]",
        "transition-all",
        "[background-image:url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")]",
        "bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22/%3E%3C/svg%3E')]",
        "bg-[length:1.25rem] bg-[position:right_0.5rem_center] bg-no-repeat",
        "pr-8",
        className
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

interface SettingsSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function SettingsSwitch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
}: SettingsSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--color-primary)]" : "bg-slate-200",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
