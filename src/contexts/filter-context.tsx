"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { useCookies } from "@/lib/cookie/use-cookies";

export type Cookie = {
  name: string;
  value: string;
};
export const COOKIE_NAMES = {
  USER_ID: "speisly_uid",
  CONSENT: "speisly_consent",
  MENSA_PREFERENCES: "speisly_mensa_preferences",
  VEGGIE_FILTER: "speisly_veggie_filter",
  VEGAN_FILTER: "speisly_vegan_filter",
} as const;

export function getCookieValue(cookies: Cookie[], name: string): string | null {
  if (!cookies || cookies.length === 0) {
    return null;
  }
  return cookies.find((c) => c.name === name)?.value || null;
}

type FilterContextType = {
  selectedMensen: string[];
  showVeggie: boolean;
  showVegan: boolean;
  filterDialogOpen: boolean;
  setSelectedMensen: (mensen: string[]) => void;
  setShowVeggie: (show: boolean) => void;
  setShowVegan: (show: boolean) => void;
  setFilterDialogOpen: (open: boolean) => void;
};

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
  const { set: setCookie, get } = useCookies();
  const [selectedMensen, setSelectedMensenState] = useState<string[]>(
    JSON.parse(get(COOKIE_NAMES.MENSA_PREFERENCES) || "[]") as string[]
  );
  const [showVeggie, setShowVeggieState] = useState<boolean>(
    get(COOKIE_NAMES.VEGGIE_FILTER) === "true"
  );
  const [showVegan, setShowVeganState] = useState<boolean>(
    get(COOKIE_NAMES.VEGAN_FILTER) === "true"
  );
  const [filterDialogOpen, setFilterDialogOpenState] = useState<boolean>(false);

  const setSelectedMensen = (mensen: string[]) => {
    setSelectedMensenState(mensen);
    setCookie({
      key: COOKIE_NAMES.MENSA_PREFERENCES,
      value: JSON.stringify(mensen),
    });
  };

  const setShowVeggie = (show: boolean) => {
    setShowVeggieState(show);
    setCookie({
      key: COOKIE_NAMES.VEGGIE_FILTER,
      value: show ? "true" : "false",
    });
  };

  const setShowVegan = (show: boolean) => {
    setShowVeganState(show);
    setCookie({
      key: COOKIE_NAMES.VEGAN_FILTER,
      value: show ? "true" : "false",
    });
  };

  const setFilterDialogOpen = (open: boolean) => {
    setFilterDialogOpenState(open);
  };

  return (
    <FilterContext.Provider
      value={{
        selectedMensen,
        showVeggie,
        showVegan,
        filterDialogOpen,
        setSelectedMensen,
        setShowVeggie,
        setShowVegan,
        setFilterDialogOpen,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return context;
}
