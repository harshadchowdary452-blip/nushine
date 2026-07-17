import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useMutation } from "@tanstack/react-query"
import { User, Lock, Save, Loader2, AlertCircle, Mail, Phone, Stethoscope, BadgeCheck } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { authApi } from "@/services/endpoints"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import type { User as UserType, ApiError } from "@/types"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }

export default function Settings() {
  const { user, setUser } = useAuthStore()
  const { addToast } = useToast()

  const [profile, setProfile] = useState({ full_name: "", phone: "", specialization: "", license_number: "" })
  const [password, setPassword] = useState({ current_password: "", new_password: "", confirm_password: "" })
  const [passwordError, setPasswordError] = useState("")

  useEffect(() => {
    if (user) {
      setProfile({
        full_name: user.full_name || "",
        phone: user.phone || "",
        specialization: user.specialization || "",
        license_number: user.license_number || "",
      })
    }
  }, [user])

  const updateMutation = useMutation({
    mutationFn: (data: typeof profile) => authApi.updateProfile(data),
    onSuccess: () => {
      setUser({ ...user!, ...profile } as UserType)
      addToast({ title: "Profile updated", description: "Your profile has been saved successfully.", variant: "success" })
    },
    onError: () => addToast({ title: "Error", description: "Failed to update profile.", variant: "destructive" }),
  })

  const passwordMutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) => authApi.changePassword(data),
    onSuccess: () => {
      addToast({ title: "Password changed", description: "Your password has been updated.", variant: "success" })
      setPassword({ current_password: "", new_password: "", confirm_password: "" })
      setPasswordError("")
    },
    onError: (err: unknown) => {
      const msg = (err as ApiError)?.response?.data?.detail || "Failed to change password."
      setPasswordError(msg)
    },
  })

  function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate(profile)
  }

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.new_password !== password.confirm_password) {
      setPasswordError("Passwords do not match")
      return
    }
    if (password.new_password.length < 8) {
      setPasswordError("Password must be at least 8 characters")
      return
    }
    setPasswordError("")
    passwordMutation.mutate({ current_password: password.current_password, new_password: password.new_password })
  }

  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"

  return (
    <motion.div className="space-y-8" variants={container} initial="hidden" animate="show">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="mt-1 text-gray-500">Manage your profile and account security.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-6">
            <Card className="overflow-hidden border-0 bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-200">
              <CardContent className="flex flex-col items-center p-8 text-center">
                <Avatar className="mb-4 h-20 w-20 ring-4 ring-white/30">
                  <AvatarFallback className="bg-white/20 text-2xl text-white">{initials}</AvatarFallback>
                </Avatar>
                <h2 className="text-xl font-bold">{user?.full_name}</h2>
                <p className="mt-1 text-sm text-blue-100">{user?.email}</p>
                <Badge variant="secondary" className="mt-3 bg-white/20 text-white hover:bg-white/30">
                  {user?.role?.replace("_", " ")}
                </Badge>
                <div className="mt-6 grid w-full grid-cols-2 gap-3 rounded-xl bg-white/20 p-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{initials.length}</p>
                    <p className="text-xs text-blue-200">Initials</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{user?.email?.length || 0}</p>
                    <p className="text-xs text-blue-200">Email Length</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <nav className="space-y-1">
              {[
                { icon: User, label: "Profile", active: true },
                { icon: Lock, label: "Password", active: false },
              ].map((item) => (
                <button
                  key={item.label}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                    item.active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Update your personal details.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input
                        value={profile.full_name}
                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input value={user?.email || ""} className="pl-10 bg-gray-50" disabled />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="pl-10"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Specialization</Label>
                    <div className="relative">
                      <Stethoscope className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input
                        value={profile.specialization}
                        onChange={(e) => setProfile({ ...profile, specialization: e.target.value })}
                        className="pl-10"
                        placeholder="e.g. Orthodontics"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>License Number</Label>
                    <div className="relative">
                      <BadgeCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input
                        value={profile.license_number}
                        onChange={(e) => setProfile({ ...profile, license_number: e.target.value })}
                        className="pl-10"
                        placeholder="License #"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Changes will be saved immediately.
                </div>

                <Button type="submit" className="gap-2" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                  <Lock className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>Update your account password.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-5">
                {passwordError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {passwordError}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input
                    type="password"
                    value={password.current_password}
                    onChange={(e) => setPassword({ ...password, current_password: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={password.new_password}
                      onChange={(e) => setPassword({ ...password, new_password: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      value={password.confirm_password}
                      onChange={(e) => setPassword({ ...password, confirm_password: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <Button type="submit" variant="destructive" className="gap-2" disabled={passwordMutation.isPending}>
                  {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
