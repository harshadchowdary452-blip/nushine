import { Badge } from "@/components/ui/badge";
import {
  channelColors,
  priorityColors,
  followUpStatusColors,
  leadStatusColors,
  campaignStatusColors,
  formatLabel,
} from ".";

interface BadgeProps {
  value: string;
  className?: string;
}

export function ChannelBadge({ value, className = "" }: BadgeProps) {
  const colors = channelColors[value] || "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}

export function PriorityBadge({ value, className = "" }: BadgeProps) {
  const colors = priorityColors[value] || "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}

export function FollowUpStatusBadge({ value, className = "" }: BadgeProps) {
  const colors = followUpStatusColors[value] || "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}

export function LeadStatusBadge({ value, className = "" }: BadgeProps) {
  const colors = leadStatusColors[value] || "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}

export function CampaignStatusBadge({ value, className = "" }: BadgeProps) {
  const colors = campaignStatusColors[value] || "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}
