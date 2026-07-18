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
  const colors = channelColors[value] || "bg-gray-50 text-gray-600";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}

export function PriorityBadge({ value, className = "" }: BadgeProps) {
  const colors = priorityColors[value] || "bg-gray-50 text-gray-600";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}

export function FollowUpStatusBadge({ value, className = "" }: BadgeProps) {
  const colors = followUpStatusColors[value] || "bg-gray-50 text-gray-600";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}

export function LeadStatusBadge({ value, className = "" }: BadgeProps) {
  const colors = leadStatusColors[value] || "bg-gray-50 text-gray-600";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}

export function CampaignStatusBadge({ value, className = "" }: BadgeProps) {
  const colors = campaignStatusColors[value] || "bg-gray-50 text-gray-600";
  return (
    <Badge className={`text-[10px] font-medium ${colors} ${className}`}>
      {formatLabel(value)}
    </Badge>
  );
}
