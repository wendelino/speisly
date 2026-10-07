import type { VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";

export default function LoadingButton({
  className,
  variant,
  size,
  loading,
  asChild = false,
  loadingText = "Laden...",
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading: boolean;
    loadingText?: string;
  }) {
  return (
    <Button
      asChild={asChild}
      className={className}
      disabled={loading}
      size={size}
      variant={variant}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        props.children
      )}
    </Button>
  );
}
