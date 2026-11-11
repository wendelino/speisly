import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./variants";

/** Mehrzeiliges Feld; wächst mit dem Inhalt (field-sizing) */
function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        fieldClass,
        "field-sizing-content block min-h-20 py-3",
        className
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
