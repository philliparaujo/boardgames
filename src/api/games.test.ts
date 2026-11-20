import { GameDoc, GameRecord } from "../types";

// In-memory stand-in for the one Firestore collection.
const mockStore = new Map<string, GameDoc>();
// Writes made by someone else between a transaction's read and its commit.
let mockInterleave: (() => void) | null = null;
let mockListener: ((snapshot: unknown) => void) | null = null;

jest.mock("../server/firebase", () => ({
  db: {},
  ensureSignedIn: () => Promise.resolve(),
}));

let mockUuidCounter = 0;
jest.mock("uuid", () => ({ v4: () => `uuid-${++mockUuidCounter}` }));

// A plain function (not jest.fn): CRA's resetMocks would wipe a jest.fn implementation.
let mockReduceCalls = 0;
const mockReduce = (game: GameDoc, action: unknown, _playerId: string): GameDoc => {
  mockReduceCalls++;
  const act = action as { type: string; by?: number };
  if (act.type === "bad") throw new Error("Nope");
  const state = (game.state as { count: number; rolls: number[] } | undefined) ?? {
    count: 0,
    rolls: [],
  };
  // A random part, like a shuffle: a recomputed result differs from a predicted one.
  state.rolls.push(Math.random());
  state.count += act.by ?? 1;
  return { ...game, status: "started", state };
};

jest.mock("../games/registry", () => ({
  getGameDefinition: (type: string) =>
    type === "counter"
      ? {
          type: "counter",
          title: "Counter",
          minPlayers: 1,
          maxPlayers: 4,
          parseAction: (a: unknown) => {
            if (!a || typeof (a as { type?: unknown }).type !== "string") {
              throw new Error("Malformed action");
            }
            return a;
          },
          reduce: (g: GameDoc, a: unknown, p: string) => mockReduce(g, a, p),
        }
      : null,
}));

jest.mock("firebase/firestore", () => {
  const snap = (id: string) => {
    const data = mockStore.get(id);
    return {
      id,
      exists: () => data !== undefined,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
      metadata: { fromCache: false },
    };
  };
  return {
    collection: () => ({}),
    doc: (_db: unknown, _c: string, id: string) => ({ id }),
    limit: () => ({}),
    orderBy: () => ({}),
    query: () => ({}),
    setDoc: async (ref: { id: string }, data: GameDoc) => {
      mockStore.set(ref.id, data);
    },
    deleteDoc: async (ref: { id: string }) => {
      mockStore.delete(ref.id);
    },
    getDocs: async () => ({
      docs: Array.from(mockStore.keys())
        .map(snap)
        .sort((a, b) => b.data().createdAt - a.data().createdAt),
    }),
    onSnapshot: (_ref: unknown, next: (s: unknown) => void) => {
      mockListener = next;
      return () => {
        mockListener = null;
      };
    },
    // Optimistic concurrency like the real SDK: retry if the document changed.
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        let readRev: string | undefined;
        const writes: Array<() => void> = [];
        const tx = {
          get: async (ref: { id: string }) => {
            readRev = mockStore.get(ref.id)?.rev;
            return snap(ref.id);
          },
          set: (ref: { id: string }, data: GameDoc) =>
            writes.push(() => mockStore.set(ref.id, JSON.parse(JSON.stringify(data)))),
          update: (ref: { id: string }, data: Partial<GameDoc>) =>
            writes.push(() => mockStore.set(ref.id, { ...mockStore.get(ref.id)!, ...data })),
          delete: (ref: { id: string }) => writes.push(() => mockStore.delete(ref.id)),
        };
        const result = await fn(tx);
        const other = mockInterleave;
        mockInterleave = null;
        other?.();
        const id = "g1";
        if (mockStore.get(id)?.rev !== readRev) continue;
        writes.forEach((w) => w());
        return result;
      }
      throw Object.assign(new Error("too much contention"), {
        name: "FirebaseError",
        code: "aborted",
      });
    },
  };
});

// eslint-disable-next-line import/first
import {
  applyAction,
  createGame,
  deleteGame,
  dispatchAction,
  friendlyError,
  joinGame,
  leaveGame,
  listGames,
  newerGame,
  STALE_WAITING_MS,
  subscribeGame,
} from "./games";

const alice = { id: "a", name: "Alice" };
const bob = { id: "b", name: "Bob" };

function seed(game: Partial<GameDoc> = {}): GameRecord {
  const doc: GameDoc = {
    gameType: "counter",
    maxPlayers: 4,
    createdAt: Date.now(),
    createdBy: alice.id,
    status: "started",
    players: [alice, bob],
    version: 3,
    rev: "r3",
    updatedAt: Date.now(),
    ...game,
  };
  mockStore.set("g1", doc);
  return { ...doc, id: "g1" };
}

const state = (id = "g1") => mockStore.get(id)!.state as { count: number; rolls: number[] };

beforeEach(() => {
  mockStore.clear();
  mockInterleave = null;
  mockListener = null;
  mockReduceCalls = 0;
});

describe("dispatchAction", () => {
  it("writes the reducer's result and bumps version/rev", async () => {
    seed();
    const written = await dispatchAction("g1", { type: "inc" }, alice.id);
    expect(state().count).toBe(1);
    expect(mockStore.get("g1")!.version).toBe(4);
    expect(mockStore.get("g1")!.rev).not.toBe("r3");
    expect(written.id).toBe("g1");
    expect(written.rev).toBe(mockStore.get("g1")!.rev);
    expect(mockStore.get("g1")).not.toHaveProperty("id");
  });

  it("predicts the result and saves exactly that when nothing changed meanwhile", async () => {
    const base = seed();
    const onPredicted = jest.fn();
    await dispatchAction("g1", { type: "inc" }, alice.id, { base, onPredicted });

    expect(mockReduceCalls).toBe(1);
    const predicted = onPredicted.mock.calls[0][0] as GameRecord;
    expect(predicted.version).toBe(4);
    expect(mockStore.get("g1")!.rev).toBe(predicted.rev);
    expect(state().rolls).toEqual((predicted.state as { rolls: number[] }).rolls);
  });

  it("re-applies the action when the game changed since the prediction", async () => {
    const base = seed();
    // Bob moved after we rendered but before our transaction read the game.
    mockStore.set("g1", { ...mockStore.get("g1")!, state: { count: 10, rolls: [] }, version: 4, rev: "r4" });
    await dispatchAction("g1", { type: "inc" }, alice.id, { base });
    expect(state().count).toBe(11);
    expect(mockStore.get("g1")!.version).toBe(5);
  });

  it("retries on contention and re-runs the reducer on the newer game", async () => {
    seed({ state: { count: 0, rolls: [] } });
    mockInterleave = () =>
      mockStore.set("g1", { ...mockStore.get("g1")!, state: { count: 5, rolls: [] }, rev: "other" });
    await dispatchAction("g1", { type: "inc" }, alice.id);
    expect(state().count).toBe(6);
  });

  it("rejects a reducer error locally, without touching the server", async () => {
    const base = seed();
    const before = mockStore.get("g1");
    const onPredicted = jest.fn();
    await expect(
      dispatchAction("g1", { type: "bad" }, alice.id, { base, onPredicted }),
    ).rejects.toThrow("Nope");
    expect(onPredicted).not.toHaveBeenCalled();
    expect(mockStore.get("g1")).toBe(before);
  });

  it("does not retry a reducer error raised inside the transaction", async () => {
    seed();
    await expect(dispatchAction("g1", { type: "bad" }, alice.id)).rejects.toThrow("Nope");
    expect(mockReduceCalls).toBe(1);
  });

  it("rejects actions from non-players and malformed actions", async () => {
    seed();
    await expect(dispatchAction("g1", { type: "inc" }, "spectator")).rejects.toThrow(
      "not a player",
    );
    await expect(dispatchAction("g1", 42, alice.id)).rejects.toThrow("Malformed action");
  });

  it("gives the reducer a copy, so the shown game is never mutated", () => {
    const base = seed({ state: { count: 1, rolls: [] } });
    applyAction(base, { type: "inc" }, alice.id);
    expect((base.state as { count: number }).count).toBe(1);
  });
});

describe("joinGame / leaveGame", () => {
  it("joins a waiting game and refuses a full or started one", async () => {
    seed({ status: "waiting", players: [alice], maxPlayers: 2 });
    await joinGame("g1", bob);
    expect(mockStore.get("g1")!.players).toEqual([alice, bob]);
    expect(mockStore.get("g1")!.version).toBe(4);
    await expect(joinGame("g1", { id: "c", name: "Cy" })).rejects.toThrow("Game is full");

    seed({ status: "started", players: [alice] });
    await expect(joinGame("g1", bob)).rejects.toThrow("already started");
  });

  it("passes the host role on when the host leaves, and deletes an empty game", async () => {
    seed({ status: "waiting" });
    await leaveGame("g1", alice.id);
    expect(mockStore.get("g1")!.players).toEqual([bob]);
    expect(mockStore.get("g1")!.createdBy).toBe(bob.id);
    await leaveGame("g1", bob.id);
    expect(mockStore.has("g1")).toBe(false);
  });

  it("refuses to leave a started game", async () => {
    seed();
    await expect(leaveGame("g1", bob.id)).rejects.toThrow("started");
  });
});

describe("createGame / listGames", () => {
  it("creates a waiting game with bookkeeping fields", async () => {
    const id = await createGame("counter", 3, alice);
    expect(mockStore.get(id)).toMatchObject({ status: "waiting", players: [alice], version: 0 });
    await expect(createGame("counter", 9, alice)).rejects.toThrow("1-4 players");
  });

  it("hides waiting games that have been idle too long", async () => {
    const old = Date.now() - STALE_WAITING_MS - 1000;
    mockStore.set("stale", { ...seed({ status: "waiting" }), createdAt: old, updatedAt: old });
    mockStore.set("oldButActive", { ...seed({ status: "started" }), createdAt: old, updatedAt: old });
    mockStore.set("fresh", { ...seed({ status: "waiting" }) });
    const ids = (await listGames()).map((g) => g.id).sort();
    expect(ids).toEqual(["fresh", "g1", "oldButActive"]);
    const all = (await listGames({ includeStale: true })).map((g) => g.id).sort();
    expect(all).toEqual(["fresh", "g1", "oldButActive", "stale"]);
  });

  it("deletes a game", async () => {
    mockStore.set("doomed", { ...seed({ status: "started" }) });
    await deleteGame("doomed");
    expect(mockStore.has("doomed")).toBe(false);
  });
});

describe("subscribeGame", () => {
  it("ignores a 'not found' that only comes from the offline cache", async () => {
    const onChange = jest.fn();
    const unsubscribe = subscribeGame("g1", onChange);
    await Promise.resolve();
    mockListener!({ exists: () => false, metadata: { fromCache: true } });
    expect(onChange).not.toHaveBeenCalled();
    mockListener!({ exists: () => false, metadata: { fromCache: false } });
    expect(onChange).toHaveBeenCalledWith(null);
    unsubscribe();
    expect(mockListener).toBeNull();
  });

  it("does not subscribe if unsubscribed before sign-in finishes", async () => {
    const unsubscribe = subscribeGame("g1", jest.fn());
    unsubscribe();
    await Promise.resolve();
    expect(mockListener).toBeNull();
  });
});

describe("helpers", () => {
  it("newerGame prefers the copy with more writes, ties to the first", () => {
    const a = { version: 2 } as GameDoc;
    const b = { version: 3 } as GameDoc;
    expect(newerGame(a, b)).toBe(b);
    expect(newerGame(b, a)).toBe(b);
    expect(newerGame(a, { version: 2 } as GameDoc)).toBe(a);
    expect(newerGame(a, null)).toBe(a);
  });

  it("friendlyError rewrites Firestore errors and passes reducer errors through", () => {
    const fb = (code: string, message = "x") =>
      Object.assign(new Error(message), { name: "FirebaseError", code });
    expect(friendlyError(fb("unavailable")).message).toMatch(/connection/);
    expect(friendlyError(fb("aborted")).message).toMatch(/same time/);
    expect(friendlyError(fb("failed-precondition", "needs an index")).message).toBe(
      "needs an index",
    );
    const plain = new Error("It's not your turn");
    expect(friendlyError(plain)).toBe(plain);
  });
});
