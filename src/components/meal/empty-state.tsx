import { SearchX } from "lucide-react";
import { useFilters } from "@/contexts/filter-context";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lnio/utils/format-date";
import { Button } from "../ui/button";

type EmptyStateProps = {
  type?: "date" | "filter";
  title?: string;
  description?: string;
  date?: Date;
  className?: string;
};

export function EmptyState({
  type = "date",
  title,
  description,
  date,
  className,
}: EmptyStateProps) {
  const formattedDate = date ? formatDay(date, "EEEE, dd.MM.yy") : null;
  const { setSelectedMensen } = useFilters();
  let displayDescription: string;
  let displayTitle: string;
  let showFilterReset = false;

  if (type === "filter") {
    displayTitle = title || "Keine Gerichte gefunden";
    displayDescription =
      description ||
      "Es wurden keine Gerichte gefunden, die den aktuellen Filtern entsprechen.";
    showFilterReset = true;
  } else {
    displayTitle = title || "Keine Gerichte gefunden";
    displayDescription =
      description ||
      (formattedDate
        ? `Keine Gerichte für ${formattedDate} verfügbar.`
        : "Keine Gerichte verfügbar.");
  }

  return (
    <div
      className={cn(
        "flex min-h-[75vh] flex-col items-center justify-center px-4 py-32",
        className
      )}
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-pulse rounded-full bg-muted opacity-50 blur-2xl" />
        <div className="relative rounded-full border border-border/50 bg-muted/50 p-3">
          <SearchX className="h-12 w-12 text-primary" />
        </div>
      </div>

      <div className="max-w-md space-y-3 text-center">
        <h3 className="font-semibold text-2xl text-foreground">
          {displayTitle}
        </h3>
        <p className="text-base text-muted-foreground leading-relaxed">
          {displayDescription}
        </p>
        {showFilterReset ? (
          <Button onClick={() => setSelectedMensen([])} variant="outline">
            Filter zurücksetzen
          </Button>
        ) : null}
      </div>
    </div>
  );
}
