import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type InfoCardProps = {
  title?: string;
  description: string;
  icon?: "info" | "warning" | "error" | "success";
  size?: "sm" | "md" | "lg";
  className?: string;
};
export function InfoCard({
  description,
  icon = "info",
  className,
}: InfoCardProps) {
  const Icon = {
    info: <Info className="size-4.5 text-primary" />,
    warning: <AlertCircle className="h-4 w-4" />,
    error: <AlertTriangle className="h-4 w-4" />,
    success: <CheckCircle className="h-4 w-4" />,
  }[icon];
  // const sizeClass = {
  //   sm: "text-sm",
  //   md: "text-base",
  //   lg: "text-lg",
  // }[size];
  return (
    <div className={cn("", className)}>
      <div className="flex items-center gap-2">
        {Icon}
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}
