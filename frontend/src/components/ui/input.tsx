import * as React from "react"
import { cn } from "@/lib/utils"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      autoComplete="off"
      className={cn(
        "flex h-9 w-full rounded-[14px] border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-all duration-200 placeholder:text-gray-400 hover:border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:shadow-glow disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50 dark:border-[#334155] dark:bg-[#1E293B] dark:text-[#F8FAFC] dark:placeholder:text-[#94A3B8] dark:hover:border-[#475569] dark:focus:border-primary dark:focus:ring-primary/20 dark:disabled:bg-[#1E293B]",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
