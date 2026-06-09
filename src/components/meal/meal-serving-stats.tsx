import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarDays, UtensilsCrossed } from "lucide-react";
import type { MealServingStats } from "@/actions/meal-serving-stats";
import Title from "../title";
import { Badge } from "../ui/badge";

type MealServingStatsProps = {
  stats: MealServingStats;
};

function formatServingDate(date: Date) {
  return format(date, "dd.MM.yyyy", { locale: de });
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-semibold text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function MealServingStatsWidget({ stats }: MealServingStatsProps) {
  const { totalServings, mensaCount, firstServed, lastServed, byMensa } = stats;

  return (
    <>
      <Title className="flex items-center gap-2" variant="h2">
        <UtensilsCrossed className="size-4.5" />
        <span className="font-semibold">Angebotshistorie</span>
      </Title>
      <div className="relative space-y-4 rounded-lg border bg-muted p-5">
        {totalServings === 0 ? (
          <p className="text-center text-muted-foreground text-sm">
            Noch keine Angebotsdaten vorhanden
          </p>
        ) : (
          <>
            <Badge className="-top-2 -right-2 absolute font-semibold">
              {totalServings} {totalServings === 1 ? "Angebot" : "Angebote"}
            </Badge>

            <div className="space-y-1 border-b pb-4">
              <StatItem label="An Mensen" value={String(mensaCount)} />
              {firstServed ? (
                <StatItem
                  label="Erstmals"
                  value={formatServingDate(firstServed)}
                />
              ) : null}
              {lastServed ? (
                <StatItem
                  label="Zuletzt"
                  value={formatServingDate(lastServed)}
                />
              ) : null}
            </div>

            <div className="space-y-3">
              <p className="flex items-center gap-1.5 font-medium text-sm">
                <CalendarDays className="size-4 text-muted-foreground" />
                Pro Mensa
              </p>
              <ul className="space-y-2">
                {byMensa.map((entry) => (
                  <li
                    className="flex items-start justify-between gap-4 rounded-md border bg-background px-3 py-2"
                    key={entry.mensaId}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {entry.mensaName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatServingDate(entry.firstServed)} –{" "}
                        {formatServingDate(entry.lastServed)}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-sm tabular-nums">
                      {entry.servingCount}×
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </>
  );
}
