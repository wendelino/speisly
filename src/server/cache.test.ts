import { describe, expect, test } from "bun:test";
import { invalidateTags } from "./cache";

function fakeCache(enabled = true) {
  const calls: string[][] = [];
  return {
    calls,
    cache: {
      enabled,
      invalidate: ({ tags }: { tags?: string | string[] }) => {
        calls.push([tags ?? []].flat());
        return Promise.resolve();
      },
    },
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("invalidateTags", () => {
  test("invalidates once by default", async () => {
    const { cache, calls } = fakeCache();
    await invalidateTags(cache as never, ["ratings:a"], { settleMs: 5 });
    await wait(20);
    expect(calls).toEqual([["ratings:a"]]);
  });

  test("settle: invalidates again after in-flight renders finished", async () => {
    const { cache, calls } = fakeCache();
    await invalidateTags(cache as never, ["ratings:a"], {
      settle: true,
      settleMs: 5,
    });
    expect(calls).toEqual([["ratings:a"]]);
    await wait(20);
    expect(calls).toEqual([["ratings:a"], ["ratings:a"]]);
  });

  test("does nothing without a provider or tags", async () => {
    const off = fakeCache(false);
    await invalidateTags(off.cache as never, ["x"], { settle: true });
    const on = fakeCache();
    await invalidateTags(on.cache as never, [], { settle: true });
    expect(off.calls).toEqual([]);
    expect(on.calls).toEqual([]);
  });
});
