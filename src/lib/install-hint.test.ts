import { describe, expect, test } from "bun:test";
import { type InstallHintState, shouldShowInstallHint } from "./install-hint";

const now = new Date("2026-10-22T12:00:00Z");
const state = (patch: Partial<InstallHintState> = {}): InstallHintState => ({
  shownCount: 0,
  dismissedAt: null,
  installed: false,
  ...patch,
});

describe("shouldShowInstallHint", () => {
  test("first visit", () => {
    expect(shouldShowInstallHint(state(), now)).toBe(true);
  });

  test("30 days pause after dismissing", () => {
    const dismissed = (iso: string) =>
      state({ shownCount: 1, dismissedAt: iso });
    expect(shouldShowInstallHint(dismissed("2026-10-01T12:00:00Z"), now)).toBe(
      false
    );
    expect(shouldShowInstallHint(dismissed("2026-09-22T12:00:00Z"), now)).toBe(
      true
    );
  });

  test("never again after three times or once installed", () => {
    expect(shouldShowInstallHint(state({ shownCount: 3 }), now)).toBe(false);
    expect(shouldShowInstallHint(state({ installed: true }), now)).toBe(false);
  });
});
