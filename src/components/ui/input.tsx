import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./variants";

function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(fieldClass, "h-11 py-2", className)}
      data-slot="input"
      {...props}
    />
  );
}

export { Input };
