import * as React from "react"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ds-skeleton rounded-[var(--ds-radius-lg)]", className)} {...props} />
}

export { Skeleton }
