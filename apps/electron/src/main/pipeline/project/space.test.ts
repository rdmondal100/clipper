import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkFreeSpace, estimateNeededBytes } from "./space";

const GIB = 1024 ** 3;

function fakeStatfs(freeBytes: number, missing: string[] = []) {
  const asked: string[] = [];
  const statfs = async (path: string) => {
    asked.push(path);
    if (missing.includes(path)) throw Object.assign(new Error("ENOENT: simulated"), { code: "ENOENT" });
    return { bavail: freeBytes / 4096, bsize: 4096 };
  };
  return { statfs, asked };
}

describe("estimateNeededBytes (R9)", () => {
  it("is 0.5 GB per hour of source plus 1 GB", () => {
    expect(estimateNeededBytes(0)).toBe(GIB);
    expect(estimateNeededBytes(3600)).toBe(1.5 * GIB);
    expect(estimateNeededBytes(2 * 3600)).toBe(2 * GIB);
  });
});

describe("checkFreeSpace (R9)", () => {
  const dir = join(tmpdir(), "Projects");

  it("warns when free space is below the estimate", async () => {
    const { statfs } = fakeStatfs(1.2 * GIB);
    expect(await checkFreeSpace(dir, 3600, { statfs })).toEqual({
      enough: false,
      freeBytes: 1.2 * GIB,
      neededBytes: 1.5 * GIB,
    });
  });

  it("is fine when free space covers the estimate", async () => {
    const { statfs } = fakeStatfs(1.5 * GIB);
    expect((await checkFreeSpace(dir, 3600, { statfs })).enough).toBe(true);
  });

  it("checks the nearest existing parent when the projects folder doesn't exist yet", async () => {
    const missing = join(dir, "not", "yet");
    const { statfs, asked } = fakeStatfs(10 * GIB, [missing, join(dir, "not")]);
    expect((await checkFreeSpace(missing, 60, { statfs })).enough).toBe(true);
    expect(asked).toEqual([missing, join(dir, "not"), dir]);
  });

  it("reads the real drive when nothing is injected", async () => {
    const result = await checkFreeSpace(tmpdir(), 60);
    expect(result.freeBytes).toBeGreaterThan(0);
  });
});
