import {
  Indicator as CheckboxPrimitiveIndicator,
  Root as CheckboxPrimitiveRoot,
} from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitiveRoot>) {
  return (
    <CheckboxPrimitiveRoot
      className={cn(
        "peer size-5 shrink-0 cursor-pointer rounded-md border-2 border-input bg-card outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitiveIndicator
        className="grid place-content-center text-current transition-none"
        data-slot="checkbox-indicator"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitiveIndicator>
    </CheckboxPrimitiveRoot>
  );
}

export { Checkbox };
