import type { ReactNode } from "react";
import { cn } from "../lib/utils.js";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "destructive" | "outline";
  size?: "sm" | "md";
}

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50",
        size === "sm" ? "h-8 px-2 text-xs" : "h-9 px-3 text-sm",
        variant === "default" && "bg-blue-600 text-white hover:bg-blue-500",
        variant === "ghost" && "hover:bg-white/10",
        variant === "outline" && "border border-white/10 hover:bg-white/5",
        variant === "destructive" && "bg-red-600 text-white hover:bg-red-500",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-white/10 text-white/80",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm",
        "placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50",
        props.className,
      )}
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-white/10 bg-black/20 px-3 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
        props.className,
      )}
      {...props}
    />
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-white/10 bg-[hsl(var(--card))]", className)}>
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-blue-500",
        className,
      )}
    />
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-white/60">
      <p className="text-sm font-medium text-white/80">{title}</p>
      {description && <p className="text-xs">{description}</p>}
    </div>
  );
}
