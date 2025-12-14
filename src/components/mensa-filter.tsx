"use client";

import { Filter, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getAllMensen } from "@/actions/mensa";
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
import { useFilters } from "@/contexts/filter-context";
import { cn } from "@/lib/utils";
import { IngredientBadge } from "./meal/ingredient-badge";

export default function MensaFilter() {
  const [mensen, setMensen] = useState<Mensa[]>([]);
  const {
    selectedMensen,
    showVeggie,
    showVegan,
    filterDialogOpen,
    setSelectedMensen,
    setShowVeggie,
    setShowVegan,
    setFilterDialogOpen,
  } = useFilters();

  useEffect(() => {
    getAllMensen().then(setMensen);
  }, []);

  const handlePreferenceToggle = (mensaId: string) => {
    const newPreferences = selectedMensen.includes(mensaId)
      ? selectedMensen.filter((id) => id !== mensaId)
      : [...selectedMensen, mensaId];

    setSelectedMensen(newPreferences);
  };

  const handleSelectAll = () => {
    const allMensaIds = mensen.map((m) => m.id);
    setSelectedMensen(allMensaIds);
  };

  const handleDeselectAll = () => {
    setSelectedMensen([]);
  };

  const handleFilterClick = () => {
    setFilterDialogOpen(true);
  };

  return (
    <>
      <div className="fixed right-0 bottom-0 z-50 flex flex-col items-end gap-2 p-3 pb-5">
        {selectedMensen.length !== 7 && selectedMensen.length > 0 && (
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-background/50 px-2.5 py-1 font-semibold text-xs backdrop-blur-sm",

              "cursor-pointer border px-3 py-2 font-bold shadow-lg hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => setSelectedMensen([])}
            type="button"
          >
            {selectedMensen.length} Mensen <X className="ml-1 size-4" />
          </button>
        )}
        {showVegan ? (
          <IngredientBadge
            onClick={() => setShowVegan(false)}
            type="vegan"
            variant="filter"
          />
        ) : null}
        {showVeggie ? (
          <IngredientBadge
            onClick={() => setShowVeggie(false)}
            type="veggie"
            variant="filter"
          />
        ) : null}

        <Button
          className="relative h-14 w-14 rounded-full shadow-lg"
          onClick={handleFilterClick}
          size="lg"
        >
          <Filter className="size-5" /> <span className="sr-only">Filter</span>
        </Button>
      </div>

      <Dialog onOpenChange={setFilterDialogOpen} open={filterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter</DialogTitle>
            <DialogDescription>
              Wähle deine bevorzugten Mensen und Ernährungsformen aus.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Veggie/Vegan Filter */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm underline">
                Ernährungsform
              </h3>
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
                  onClick={handleSelectAll}
                  size="sm"
                  variant="outline"
                >
                  Alle auswählen
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleDeselectAll}
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
    </>
  );
}
