/** Führt `task` nach dem Laden der Seite aus, sobald der Browser Leerlauf hat */
export function whenIdle(task: () => void): void {
  const schedule = () => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(task, { timeout: 2000 });
    } else {
      setTimeout(task, 200);
    }
  };
  if (document.readyState === "complete") {
    schedule();
  } else {
    window.addEventListener("load", schedule, { once: true });
  }
}
