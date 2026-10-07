import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { type ButtonVariants, buttonVariants } from "./variants";

function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & ButtonVariants) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      data-slot="button"
      type="button"
      {...props}
    />
  );
}

export { Button };
