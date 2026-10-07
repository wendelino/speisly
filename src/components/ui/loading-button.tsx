import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "./button";

type LoadingButtonProps = ComponentProps<typeof Button> & {
  loading: boolean;
  loadingText?: string;
};

/** Button mit Ladezustand (Spinner + Text, deaktiviert) */
export function LoadingButton({
  loading,
  loadingText = "Laden...",
  disabled,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={loading || disabled} {...props}>
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
