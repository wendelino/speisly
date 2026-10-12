"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * Rendert `children` einmalig unsichtbar, sobald die Seite fertig geladen ist
 * und der Browser Leerlauf hat – und hängt sie danach wieder aus.
 *
 * Popover- und Dialog-Inhalte (Kalender, Filter) werden von Radix erst beim
 * Öffnen gemountet. Ohne Vorwärmen läuft ihr Code beim ersten Klick zum
 * ersten Mal und das Öffnen hakt spürbar. Nach dem Vorrendern ist der Code
 * warm und der erste Klick so schnell wie jeder weitere.
 */
export function IdlePrerender({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"waiting" | "rendering" | "done">(
    "waiting"
  );

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => setPhase("rendering"), {
          timeout: 3000,
        });
      } else {
        // Safari kennt requestIdleCallback nicht
        timeoutId = setTimeout(() => setPhase("rendering"), 500);
      }
    };

    if (document.readyState === "complete") {
      schedule();
    } else {
      window.addEventListener("load", schedule, { once: true });
    }

    return () => {
      window.removeEventListener("load", schedule);
      if (idleId !== undefined) {
        window.cancelIdleCallback(idleId);
      }
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (phase !== "rendering") {
      return;
    }
    // Einen Frame stehen lassen, damit auch Layout & Styles berechnet werden
    const frameId = requestAnimationFrame(() => setPhase("done"));
    return () => cancelAnimationFrame(frameId);
  }, [phase]);

  if (phase !== "rendering") {
    return null;
  }

  return (
    <div
      aria-hidden
      inert
      style={{
        position: "fixed",
        top: 0,
        left: -10_000,
        visibility: "hidden",
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}
