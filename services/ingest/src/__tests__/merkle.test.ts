import { describe, expect, it } from "vitest";
import { buildMerkleTree } from "../merkle.js";

describe("buildMerkleTree", () => {
  it("is deterministic for the same input", () => {
    const events = ['{"a":1}', '{"a":2}', '{"a":3}'];
    expect(buildMerkleTree(events).root).toBe(buildMerkleTree(events).root);
  });

  it("changes root if any event changes", () => {
    const a = buildMerkleTree(['{"a":1}', '{"a":2}']);
    const b = buildMerkleTree(['{"a":1}', '{"a":9}']);
    expect(a.root).not.toBe(b.root);
  });

  it("is order-sensitive across leaves (event order matters for the proof)", () => {
    const a = buildMerkleTree(['{"a":1}', '{"a":2}', '{"a":3}']);
    const b = buildMerkleTree(['{"a":3}', '{"a":2}', '{"a":1}']);
    expect(a.root).not.toBe(b.root);
  });

  it("handles a single event", () => {
    const tree = buildMerkleTree(['{"a":1}']);
    expect(tree.root).toHaveLength(64);
    expect(tree.leaves).toHaveLength(1);
  });

  it("handles an odd number of events without throwing", () => {
    expect(() => buildMerkleTree(['{"a":1}', '{"a":2}', '{"a":3}'])).not.toThrow();
  });

  it("throws on zero events", () => {
    expect(() => buildMerkleTree([])).toThrow();
  });
});
