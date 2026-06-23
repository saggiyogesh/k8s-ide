import React from "react";
import { cn } from "../utils.js";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-zinc-700 text-zinc-200",
  success: "bg-emerald-900 text-emerald-300",
  warning: "bg-amber-900 text-amber-300",
  error: "bg-red-900 text-red-300",
  info: "bg-sky-900 text-sky-300",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
