"use client";

import { Button } from "@/components/ui/button";

export function WelcomeCTA() {
  const scrollToDaySelector = () => {
    const element = document.getElementById("day-selector");
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 rounded-2xl border bg-card p-8 shadow-lg">
        <div className="text-center">
          <h2 className="mb-2 font-bold text-2xl sm:text-3xl">
            Willkommen bei Speisly! 👋
          </h2>
          <p className="text-lg text-muted-foreground">
            Entdecke die leckersten Gerichte aus deiner Mensa
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-muted-foreground text-sm">
            Wähle ein Datum aus und los geht&apos;s!
          </p>
          <Button
            className="group relative gap-3 px-8 py-6 text-base"
            onClick={scrollToDaySelector}
            size="lg"
          >
            <span>Los geht&apos;s</span>
            <svg
              aria-label="Arrow down"
              className="size-6 rotate-90 transition-transform group-hover:translate-x-1"
              role="img"
              viewBox="0 0 43.1 85.9"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11.3,2.5c-5.8,5-8.7,12.7-9,20.3s2,15.1,5.3,22c6.7,14,18,25.8,31.7,33.1"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
              <path
                d="M40.6,78.1C39,71.3,37.2,64.6,35.2,58"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
              <path
                d="M39.8,78.5c-7.2,1.7-14.3,3.3-21.5,4.9"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
            </svg>
          </Button>
        </div>
      </div>
    </section>
  );
}
