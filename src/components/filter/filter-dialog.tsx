import { EggFried, Leaf, Utensils } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  $filters,
  setSelectedMensen,
  setShowVegan,
  setShowVeggie,
} from "@/stores/filters";
import { $filterDialogOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";

type Diet = "all" | "veggie" | "vegan";

const DIETS: {
  value: Diet;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  active: string;
}[] = [
  {
    value: "all",
    label: "Alles",
    Icon: Utensils,
    active: "bg-primary text-primary-foreground",
  },
  {
    value: "veggie",
    label: "Vegetarisch",
    Icon: EggFried,
    active: "bg-sun-soft text-sun ring-sun/40",
  },
  {
    value: "vegan",
    label: "Vegan",
    Icon: Leaf,
    active: "bg-mint-soft text-mint ring-mint/40",
  },
];

/**
 * Filter-Dialog (Ernährungsform und Mensen). Wird erst geladen, wenn jemand
 * den Filter-Button benutzt (filter-fab.astro).
 */
export function FilterDialog({ mensen }: { mensen: Mensa[] }) {
  const { selectedMensen, showVeggie, showVegan } = useAtom($filters);
  const open = useAtom($filterDialogOpen);
  const diet: Diet = showVegan ? "vegan" : showVeggie ? "veggie" : "all";

  const selectDiet = (value: Diet) => {
    setShowVeggie(value === "veggie");
    setShowVegan(value === "vegan");
  };

  const toggleMensa = (mensaId: string) => {
    setSelectedMensen(
      selectedMensen.includes(mensaId)
        ? selectedMensen.filter((id) => id !== mensaId)
        : [...selectedMensen, mensaId]
    );
  };

  return (
    <Drawer onOpenChange={(v) => $filterDialogOpen.set(v)} open={open}>
      <DrawerContent returnFocus="[data-filter-fab]">
        <DrawerHeader>
          <DrawerTitle>Filter</DrawerTitle>
          <DrawerDescription>
            Wähle deine Ernährungsform und Lieblingsmensen.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-display font-semibold text-sm">
              Ernährungsform
            </h3>
            <fieldset className="grid grid-cols-3 gap-2">
              <legend className="sr-only">Ernährungsform</legend>
              {DIETS.map(({ value, label, Icon, active }) => {
                const checked = diet === value;
                return (
                  <button
                    aria-pressed={checked}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 font-semibold text-xs outline-none ring-1 transition-all duration-200 focus-visible:ring-[3px] focus-visible:ring-ring active:scale-95",
                      checked
                        ? cn(active, "shadow-soft")
                        : "bg-muted/60 text-muted-foreground ring-transparent hover:bg-muted"
                    )}
                    id={value === "all" ? undefined : `${value}-filter`}
                    key={value}
                    onClick={() => selectDiet(value)}
                    type="button"
                  >
                    <Icon className="size-5" />
                    {label}
                  </button>
                );
              })}
            </fieldset>
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display font-semibold text-sm">Mensen</h3>
              <p className="text-muted-foreground text-xs">
                {selectedMensen.length === 0
                  ? "Keine Auswahl = alle Mensen"
                  : `${selectedMensen.length} ausgewählt`}
              </p>
            </div>
            <ul className="space-y-1.5 rounded-2xl bg-muted/60 p-1.5">
              {mensen.map((mensa) => {
                const checked = selectedMensen.includes(mensa.id);
                return (
                  <li key={mensa.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 font-medium text-sm transition-colors",
                        checked ? "bg-card shadow-soft" : "hover:bg-card/60"
                      )}
                      htmlFor={`mensa-${mensa.id}`}
                    >
                      {mensa.name}
                      <Switch
                        checked={checked}
                        id={`mensa-${mensa.id}`}
                        onCheckedChange={() => toggleMensa(mensa.id)}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => setSelectedMensen(mensen.map((m) => m.id))}
                size="sm"
                variant="outline"
              >
                Alle auswählen
              </Button>
              <Button
                className="flex-1"
                onClick={() => setSelectedMensen([])}
                size="sm"
                variant="outline"
              >
                Alle abwählen
              </Button>
            </div>
          </section>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
