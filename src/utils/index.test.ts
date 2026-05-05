import { describe, expect, it } from "vitest";
import { to } from "./index";

describe("to", () => {
  it("returns the resolved value and a null error", async () => {
    await expect(to(Promise.resolve("ok"))).resolves.toEqual(["ok", null]);
  });

  it("returns a null value and the rejection error", async () => {
    const error = new Error("boom");
    await expect(to(Promise.reject(error))).resolves.toEqual([null, error]);
  });
});
