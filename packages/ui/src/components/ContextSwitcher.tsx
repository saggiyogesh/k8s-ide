import * as Select from "@radix-ui/react-select";
import { ChevronDown, Server, Check } from "lucide-react";
import type { ClusterContext } from "@k8s-ide/core";
import { cn } from "../lib/utils.js";

export interface ContextSwitcherProps {
  contexts: ClusterContext[];
  activeContext?: string | null;
  onSwitch?: (context: string) => void;
  isLoading?: boolean;
}

export function ContextSwitcher({
  contexts,
  activeContext,
  onSwitch,
  isLoading,
}: ContextSwitcherProps) {
  return (
    <Select.Root value={activeContext ?? ""} onValueChange={onSwitch ?? (() => undefined)}>
      <Select.Trigger
        className={cn(
          "flex h-8 min-w-[200px] items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors",
          "hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        )}
        disabled={isLoading}
      >
        <div className="flex items-center gap-2 truncate">
          <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Select.Value placeholder="Select context…" />
        </div>
        <Select.Icon>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="z-50 min-w-[200px] overflow-hidden rounded-md border border-border bg-popover shadow-md"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1">
            {contexts.map((ctx) => (
              <Select.Item
                key={ctx.name}
                value={ctx.name}
                className={cn(
                  "relative flex cursor-default select-none items-center rounded-sm px-8 py-1.5 text-sm outline-none",
                  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                )}
              >
                <Select.ItemIndicator className="absolute left-2 flex items-center">
                  <Check className="h-3.5 w-3.5" />
                </Select.ItemIndicator>
                <Select.ItemText>{ctx.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
