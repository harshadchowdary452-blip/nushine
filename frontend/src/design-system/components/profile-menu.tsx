"use client"

import { useRef } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { User, LogOut, Settings, Building2, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { useAuthStore } from "@/store/authStore"
import { authApi } from "@/services/endpoints"
import { queryClient } from "@/lib/queryClient"
import { getHospitalOverride } from "@/lib/hospital-override"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  GROUP_ADMIN: "Group Admin",
  HOSPITAL_ADMIN: "Hospital Admin",
  CLINIC_MANAGER: "Clinic Manager",
  CONSULTANT: "Consultant",
  RECEPTIONIST: "Receptionist",
}

interface ProfileMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export default function ProfileMenu({ open, onOpenChange, triggerRef }: ProfileMenuProps) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef, { gap: 6, align: "end", popupRef })
  useOverlayDismiss(open, () => onOpenChange(false), triggerRef, popupRef)
  const layer = resolveOverlayLayer(triggerRef.current)

  const { data: ctx } = useQuery({
    queryKey: ["context", "current"],
    queryFn: () => authApi.switchContext({}),
    enabled: !!user,
    staleTime: 120_000,
  })

  const initials =
    user?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U"

  const override = getHospitalOverride()
  const contextLabel = override
    ? (ctx?.hospital_name ?? "Hospital")
    : ctx?.scope === "global"
      ? "All Hospitals"
      : ctx?.scope === "group"
        ? (ctx?.admin_group_name ?? "All Hospitals in Group")
        : (ctx?.hospital_name ?? user?.hospital_name ?? "No hospital")

  const handleLogout = () => {
    onOpenChange(false)
    queryClient.clear()
    logout()
    navigate("/login")
  }

  return (
    <>
      {open &&
        createPortal(
          <motion.div
            ref={popupRef}
            role="menu"
            aria-label="User menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
            style={position ? { top: position.top, left: position.left } : undefined}
            className={cn(
              "fixed w-64 overflow-hidden rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-dropdown)]",
              layer,
            )}
          >
            <div className="border-b border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 ring-2 ring-[var(--ds-primary-light)]">
                  <AvatarFallback className="bg-[var(--ds-primary)] text-sm font-semibold text-[var(--ds-primary-foreground)]">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ds-text)]">
                    {user?.full_name ?? "User"}
                  </p>
                  <p className="truncate text-[11px] text-[var(--ds-text-secondary)]">
                    {roleLabels[user?.role ?? ""] ?? user?.role ?? ""}
                  </p>
                </div>
              </div>
              <p className="mt-2.5 flex items-center gap-1.5 truncate text-[11px] text-[var(--ds-text-tertiary)]">
                <Building2 className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{contextLabel}</span>
              </p>
            </div>
            <div className="p-1.5">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ds-text-tertiary)]">
                Account
              </div>
              <Link
                to="/settings"
                onClick={() => onOpenChange(false)}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-[var(--ds-radius-lg)] px-3 py-2 text-sm text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
              >
                <Settings className="h-4 w-4 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />
                <span className="flex-1">Settings</span>
                <ChevronRight
                  className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]"
                  strokeWidth={1.5}
                />
              </Link>
              <Link
                to="/settings/profile"
                onClick={() => onOpenChange(false)}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-[var(--ds-radius-lg)] px-3 py-2 text-sm text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
              >
                <User className="h-4 w-4 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />
                <span className="flex-1">My Profile</span>
                <ChevronRight
                  className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]"
                  strokeWidth={1.5}
                />
              </Link>
              <div className="my-1.5 h-px bg-[var(--ds-border-subtle)]" />
              <button
                onClick={handleLogout}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-[var(--ds-radius-lg)] px-3 py-2 text-sm font-medium text-[var(--ds-danger)] transition-colors hover:bg-[var(--ds-danger-subtle)]"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} />
                Logout
              </button>
            </div>
          </motion.div>,
          document.body,
        )}
    </>
  )
}
