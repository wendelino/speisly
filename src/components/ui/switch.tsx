import {
  Root as SwitchPrimitiveRoot,
  Thumb as SwitchPrimitiveThumb,
} from "@radix-ui/react-switch";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitiveRoot>) {
  return (
    <SwitchPrimitiveRoot
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitiveThumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-white shadow-soft ring-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitiveRoot>
  );
}

export { Switch };
