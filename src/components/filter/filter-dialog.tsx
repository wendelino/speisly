import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  EggFried,
  Leaf,
  ShieldBan,
  Star,
  Utensils,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ALLERGENS, type AllergenCode } from "@/lib/allergens";
import { cn } from "@/lib/utils";
import {
  $filters,
  type SortMode,
  setHiddenAllergens,
  setSelectedMensen,
  setShowVegan,
  setShowVeggie,
  setSort,
} from "@/stores/filters";
import { $filterDialogOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";

type Diet = "all" | "veggie" | "vegan";

const DIETS: {
  value: Diet;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  tint: string;
}[] = [
  {
    value: "all",
    label: "Alles",
    Icon: Utensils,
    tint: "text-primary",
  },
  {
    value: "veggie",
    label: "Vegetarisch",
    Icon: EggFried,
    tint: "text-sun",
  },
  {
    value: "vegan",
    label: "Vegan",
    Icon: Leaf,
    tint: "text-mint",
  },
];

const SORTS: {
  value: SortMode;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { value: "default", label: "Standard", Icon: ArrowUpDown },
  { value: "price-asc", label: "Günstigste zuerst", Icon: ArrowUpNarrowWide },
  { value: "price-desc", label: "Teuerste zuerst", Icon: ArrowDownWideNarrow },
  { value: "rating", label: "Beste Bewertung", Icon: Star },
];

/**
 * Ernährungsform und Sortierung als zwei Auswahllisten nebeneinander.
 * Die Sortierung wirkt per CSS (lib/filters/boot.ts).
 */
function DietAndSort({
  diet,
  onDiet,
  sort,
}: {
  diet: Diet;
  onDiet: (value: Diet) => void;
  sort: SortMode;
}) {
  return (
    <section className="grid grid-cols-2 gap-3">
      <div className="min-w-0 space-y-2">
        <h3 className="font-display font-semibold text-sm" id="diet-label">
          Ernährung
        </h3>
        <Select onValueChange={(value) => onDiet(value as Diet)} value={diet}>
          <SelectTrigger
            aria-labelledby="diet-label diet-select"
            id="diet-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIETS.map(({ value, label, Icon, tint }) => (
              <SelectItem key={value} value={value}>
                <Icon className={cn("size-4 shrink-0", tint)} />
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 space-y-2">
        <h3 className="font-display font-semibold text-sm" id="sort-label">
          Sortierung
        </h3>
        <Select
          onValueChange={(value) => setSort(value as SortMode)}
          value={sort}
        >
          <SelectTrigger
            aria-labelledby="sort-label sort-select"
            id="sort-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map(({ value, label, Icon }) => (
              <SelectItem key={value} value={value}>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

/**
 * Allergene als aufklappbarer Unterbereich: zu, solange nichts gewählt ist;
 * die Kopfzeile fasst die Auswahl zusammen.
 */
function AllergenSection({ hidden }: { hidden: AllergenCode[] }) {
  const [expanded, setExpanded] = useState(hidden.length > 0);
  const labels = ALLERGENS.filter((a) => hidden.includes(a.code)).map(
    (a) => a.label
  );
  const toggle = (code: AllergenCode) =>
    setHiddenAllergens(
      hidden.includes(code)
        ? hidden.filter((c) => c !== code)
        : [...hidden, code]
    );

  return (
    <section className="rounded-2xl bg-muted/60 p-1.5">
      <button
        aria-controls="allergen-list"
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-card/70 focus-visible:ring-[3px] focus-visible:ring-ring"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
            hidden.length > 0
              ? "bg-rose-soft text-rose"
              : "bg-card text-muted-foreground shadow-soft"
          )}
        >
          <ShieldBan className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-semibold text-sm">
            Allergene ausblenden
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {labels.length === 0
              ? "Nichts ausgeblendet"
              : `Ohne ${labels.join(", ")}`}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
            expanded ? "rotate-180" : ""
          )}
        />
      </button>
      {expanded ? (
        <div className="space-y-2 p-1.5 pt-2" id="allergen-list">
          <p className="px-1 text-muted-foreground text-xs leading-relaxed">
            Gerichte, die eines der gewählten Allergene enthalten, verschwinden
            aus dem Speiseplan. Grundlage sind die Angaben des Studentenwerks,
            ohne Gewähr: Der Filter ist keine Garantie. Frag im Zweifel in der
            Mensa nach.
          </p>
          <ul className="grid grid-cols-2 gap-1.5">
            {ALLERGENS.map(({ code, label, hint }) => {
              const checked = hidden.includes(code);
              return (
                <li key={code}>
                  <button
                    aria-pressed={checked}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left outline-none ring-1 transition-[background-color,color,box-shadow] duration-200 focus-visible:ring-[3px] focus-visible:ring-ring active:scale-[0.98]",
                      checked
                        ? "bg-rose-soft text-rose ring-rose/30"
                        : "bg-card text-foreground ring-transparent hover:bg-accent"
                    )}
                    onClick={() => toggle(code)}
                    type="button"
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-md font-bold text-[0.65rem] ring-1 transition-colors",
                        checked
                          ? "bg-rose text-white ring-rose"
                          : "bg-muted text-muted-foreground ring-border"
                      )}
                    >
                      {checked ? (
                        <Check className="size-3.5" />
                      ) : (
                        <span>{code}</span>
                      )}
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block font-semibold text-xs">
                        {label}
                      </span>
                      {hint ? (
                        <span className="block truncate text-[0.65rem] opacity-70">
                          {hint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {hidden.length > 0 ? (
            <Button
              className="w-full"
              onClick={() => setHiddenAllergens([])}
              size="sm"
              variant="outline"
            >
              Allergene zurücksetzen
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Filter-Dialog (Ernährungsform, Allergene, Sortierung und Mensen). Wird erst geladen,
 * wenn jemand den Filter-Button benutzt (filter-fab.astro).
 */
export function FilterDialog({ mensen }: { mensen: Mensa[] }) {
  const { selectedMensen, showVeggie, showVegan, hiddenAllergens, sort } =
    useAtom($filters);
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
            Wähle Ernährungsform, Allergene, Sortierung und Lieblingsmensen.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="space-y-6">
          <DietAndSort
            diet={diet}
            onDiet={selectDiet}
            sort={sort ?? "default"}
          />

          <AllergenSection hidden={hiddenAllergens} />

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
                const rowClass = checked ? "bg-card shadow-soft" : "";
                return (
                  <li key={mensa.id}>
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 font-medium text-sm transition-colors",
                        rowClass
                      )}
                    >
                      <span id={`mensa-${mensa.id}`}>{mensa.name}</span>
                      <Switch
                        aria-labelledby={`mensa-${mensa.id}`}
                        checked={checked}
                        onCheckedChange={() => toggleMensa(mensa.id)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2 pb-3 sm:pb-1">
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
