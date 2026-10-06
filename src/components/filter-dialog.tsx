import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  setSelectedMensen,
  setShowVegan,
  setShowVeggie,
} from "@/stores/filters";
import { $filterDialogOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";
import { useFilterState } from "@/stores/use-filters";

/**
 * Filter-Dialog (Markup unverändert aus mensa-filter.tsx). Wird erst geladen,
 * wenn jemand den Filter-Button benutzt (filter-fab.astro).
 */
export function FilterDialog({ mensen }: { mensen: Mensa[] }) {
  const { selectedMensen, showVeggie, showVegan } = useFilterState();
  const open = useAtom($filterDialogOpen, false);

  const handlePreferenceToggle = (mensaId: string) => {
    setSelectedMensen(
      selectedMensen.includes(mensaId)
        ? selectedMensen.filter((id) => id !== mensaId)
        : [...selectedMensen, mensaId]
    );
  };

  return (
    <Dialog onOpenChange={(v) => $filterDialogOpen.set(v)} open={open}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          // kein Radix-Trigger vorhanden: Fokus zurück auf den Filter-Button
          event.preventDefault();
          document.querySelector<HTMLElement>("[data-filter-fab]")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Filter</DialogTitle>
          <DialogDescription>
            Wähle deine bevorzugten Mensen und Ernährungsformen aus.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Veggie/Vegan Filter */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm underline">Ernährungsform</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between space-x-2">
                <Label
                  className="flex-1 cursor-pointer font-medium text-sm"
                  htmlFor="veggie-filter"
                >
                  Vegetarisch
                </Label>
                <Switch
                  checked={showVeggie}
                  id="veggie-filter"
                  onCheckedChange={(checked) => {
                    setShowVeggie(checked);
                    if (checked) {
                      setShowVegan(false);
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-between space-x-2">
                <Label
                  className="flex-1 cursor-pointer font-medium text-sm"
                  htmlFor="vegan-filter"
                >
                  Vegan
                </Label>
                <Switch
                  checked={showVegan}
                  id="vegan-filter"
                  onCheckedChange={(checked) => {
                    setShowVegan(checked);
                    if (checked) {
                      setShowVeggie(false);
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Mensa Filter */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm underline">Mensen</h3>

            <div className="max-h-[300px] space-y-3 overflow-y-auto">
              {mensen.map((mensa) => (
                <div
                  className="flex items-center justify-between space-x-2"
                  key={mensa.id}
                >
                  <Label
                    className="flex-1 cursor-pointer font-medium text-sm"
                    htmlFor={`mensa-${mensa.id}`}
                  >
                    {mensa.name}
                  </Label>
                  <Switch
                    checked={selectedMensen.includes(mensa.id)}
                    id={`mensa-${mensa.id}`}
                    onCheckedChange={() => handlePreferenceToggle(mensa.id)}
                  />
                </div>
              ))}
            </div>
            {selectedMensen.length === 0 && (
              <p className="text-muted-foreground text-xs italic">
                Keine Auswahl = Alle Mensen werden angezeigt
              </p>
            )}
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
