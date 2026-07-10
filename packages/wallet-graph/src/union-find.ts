/**
 * Plain in-memory union-find over wallet addresses. Used by the backtest/
 * batch cluster-rebuild path (packages/wallet-graph/src/backfill.ts) where
 * operating on a big batch of edges in memory is far cheaper than one DB
 * round-trip per merge. The live per-launch path uses ClusterStore instead,
 * which persists merges directly in Postgres.
 */
export class UnionFind {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();

  private ensure(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    return x;
  }

  find(x: string): string {
    this.ensure(x);
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }

  /** Groups every wallet seen so far by its cluster root. */
  groups(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const member of this.parent.keys()) {
      const root = this.find(member);
      const group = out.get(root) ?? [];
      group.push(member);
      out.set(root, group);
    }
    return out;
  }
}
