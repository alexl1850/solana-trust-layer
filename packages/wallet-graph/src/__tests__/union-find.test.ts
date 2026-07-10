import { describe, expect, it } from "vitest";
import { UnionFind } from "../union-find.js";

describe("UnionFind", () => {
  it("merges transitively connected wallets into one cluster", () => {
    const uf = new UnionFind();
    uf.union("A", "B");
    uf.union("B", "C");
    uf.union("X", "Y");

    expect(uf.connected("A", "C")).toBe(true);
    expect(uf.connected("A", "X")).toBe(false);

    const groups = [...uf.groups().values()].map((g) => g.sort());
    expect(groups).toContainEqual(["A", "B", "C"].sort());
    expect(groups).toContainEqual(["X", "Y"].sort());
  });
});
