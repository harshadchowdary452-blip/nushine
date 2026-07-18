import { Card, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}

export function MetricCard({ title, value, subtitle, icon, trend, className = "" }: MetricCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            {trend && (
              <p className={`text-xs mt-1 ${trend.isPositive ? "text-green-600" : "text-red-600"}`}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </p>
            )}
          </div>
          {icon && <div className="shrink-0 ml-3 text-muted-foreground">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
