import { GameDoc } from "../../types";
import { CITIES, EDGES } from "./map/map";
import { plantData, PLANT_NUMBERS } from "./plants";
import { buildCost, distancesFrom, endCities, reduce, resourceCost, unitPrice } from "./rules";
import { PowerGridAction, PowerGridState } from "./types";

function makeGame(ids: string[]): GameDoc {
  return {
    gameType: "powerGrid",
    maxPlayers: 4,
    createdAt: 0,
    createdBy: ids[0],
    status: "waiting",
    players: ids.map((id) => ({ id, name: id })),
  };
}

function started(ids: string[]): GameDoc {
  return reduce(makeGame(ids), { type: "start" }, ids[0]);
}

function st(g: GameDoc): PowerGridState {
  return g.state as PowerGridState;
}

// Applies an action as the player whose turn it is in the current phase.
function actAsCurrent(g: GameDoc, action: PowerGridAction): GameDoc {
  return reduce(g, action, st(g).current!);
}

// Plays every player's pass or required choice until the round number changes or the game ends.
function finishRound(g: GameDoc): GameDoc {
  const round = st(g).round;
  for (let guard = 0; guard < 200; guard++) {
    if (g.status === "finished" || st(g).round !== round) return g;
    const s = st(g);
    const action: PowerGridAction =
      s.phase === "auction"
        ? { type: "pass" }
        : s.phase === "resources"
          ? { type: "doneResources" }
          : s.phase === "build"
            ? { type: "doneBuild" }
            : { type: "power", plants: [] };
    g = actAsCurrent(g, action);
  }
  throw new Error("round did not finish");
}

// Passes out of the auction phase and both sub-phases until the build phase.
function toBuildPhase(g: GameDoc): GameDoc {
  g = actAsCurrent(g, { type: "pass" });
  while (st(g).phase === "auction") g = actAsCurrent(g, { type: "pass" });
  while (st(g).phase === "resources") g = actAsCurrent(g, { type: "doneResources" });
  return g;
}

const IDS = ["alice", "bob"];

describe("map", () => {
  it("only references known cities", () => {
    const ids = CITIES.map((c) => c.id);
    for (const e of EDGES) {
      expect(ids).toContain(e.from);
      expect(ids).toContain(e.to);
    }
  });

  it("has no duplicate or self-links and sane costs", () => {
    const seen = new Set<string>();
    for (const e of EDGES) {
      expect(e.from).not.toBe(e.to);
      const key = [e.from, e.to].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(e.cost).toBeGreaterThanOrEqual(1);
      expect(e.cost).toBeLessThanOrEqual(6);
    }
  });

  it("is connected", () => {
    const dist = distancesFrom([CITIES[0].id]);
    for (const c of CITIES) expect(dist[c.id]).toBeLessThan(Infinity);
  });
});

describe("plants", () => {
  it("has the expected kinds and sizes", () => {
    const kinds = new Set<string>();
    for (const n of PLANT_NUMBERS) {
      const d = plantData(n);
      kinds.add(d.kind);
      expect(d.cities).toBeGreaterThanOrEqual(1);
      if (d.kind === "eco") expect(d.inputs).toBe(0);
      else expect(d.inputs).toBeGreaterThanOrEqual(1);
    }
    expect(Array.from(kinds).sort()).toEqual(["coal", "eco", "garbage", "oil", "uranium"]);
  });
});

describe("start", () => {
  it("deals money, a market and a deck, and begins the auction", () => {
    const g = started(IDS);
    const s = st(g);
    expect(g.status).toBe("started");
    expect(s.phase).toBe("auction");
    expect(s.money.alice).toBe(50);
    expect(s.market.current).toHaveLength(4);
    expect(s.market.future).toHaveLength(4);
    expect(s.deck).toHaveLength(PLANT_NUMBERS.length - 8 - 4 - 4);
    expect(s.current).toBe(s.order[0]);
  });

  it("only lets the host start, and only once", () => {
    expect(() => reduce(makeGame(IDS), { type: "start" }, "bob")).toThrow(/host/);
    expect(() => reduce(started(IDS), { type: "start" }, "alice")).toThrow(/already/);
  });
});

describe("auction", () => {
  it("sells to the only bidder at the opening price", () => {
    let g = started(IDS);
    const nominator = st(g).current!;
    const other = st(g).order.find((p) => p !== nominator)!;
    const plant = st(g).market.current[0];

    g = actAsCurrent(g, { type: "nominate", plant });
    expect(st(g).auction).not.toBeNull();
    g = reduce(g, { type: "fold" }, other);

    const s = st(g);
    expect(s.auction).toBeNull();
    expect(s.money[nominator]).toBe(50 - plant);
    expect(s.plants[nominator].map((p) => p.number)).toContain(plant);
    expect(s.market.current).toHaveLength(4);
    expect(s.market.current).not.toContain(plant);
    expect(s.current).toBe(other);
  });

  it("goes to the highest bidder at their price", () => {
    let g = started(IDS);
    const nominator = st(g).current!;
    const other = st(g).order.find((p) => p !== nominator)!;
    const plant = st(g).market.current[0];

    g = actAsCurrent(g, { type: "nominate", plant });
    g = reduce(g, { type: "bid", amount: plant + 3 }, other);
    // The nominator is the one with a decision now.
    g = reduce(g, { type: "fold" }, nominator);

    expect(st(g).money[other]).toBe(50 - (plant + 3));
    expect(st(g).plants[other].map((p) => p.number)).toContain(plant);
  });

  it("rejects bids that don't raise the price, and bids out of turn", () => {
    let g = started(IDS);
    const nominator = st(g).current!;
    const other = st(g).order.find((p) => p !== nominator)!;
    const plant = st(g).market.current[0];
    g = actAsCurrent(g, { type: "nominate", plant });
    expect(() => reduce(g, { type: "bid", amount: plant }, other)).toThrow(/more than/);
    expect(() => reduce(g, { type: "bid", amount: plant + 1 }, nominator)).toThrow(/turn/);
  });

  it("removes a bidder who can't afford to outbid", () => {
    let g = started(IDS);
    const nominator = st(g).current!;
    const other = st(g).order.find((p) => p !== nominator)!;
    const plant = st(g).market.current[0];
    // Give the other player just enough to hold the bid at the opening price.
    g = { ...g, state: { ...st(g), money: { ...st(g).money, [other]: plant } } };
    g = actAsCurrent(g, { type: "nominate", plant });
    // The other player can't afford to outbid, so the nominator wins without a decision.
    expect(st(g).auction).toBeNull();
    expect(st(g).plants[nominator].map((p) => p.number)).toContain(plant);
  });

  it("only auctions from the actual market, not the future market", () => {
    const g = started(IDS);
    const future = st(g).market.future[0];
    expect(() => actAsCurrent(g, { type: "nominate", plant: future })).toThrow(/actual market/);
  });

  it("can't nominate a plant that isn't in the market", () => {
    const g = started(IDS);
    const missing = PLANT_NUMBERS.find(
      (n) => !st(g).market.current.includes(n) && !st(g).market.future.includes(n),
    )!;
    expect(() => actAsCurrent(g, { type: "nominate", plant: missing })).toThrow(/market/);
  });
});

describe("resources", () => {
  // Gives alice a plant and moves to the resources phase, with alice to act first.
  function resourcesWith(plant: number): GameDoc {
    let g = started(IDS);
    const s = st(g);
    g = { ...g, state: { ...s, plants: { ...s.plants, alice: [{ number: plant, stored: 0 }] } } };
    // Two passes end the auction phase, which moves on to resources.
    g = actAsCurrent(g, { type: "pass" });
    g = actAsCurrent(g, { type: "pass" });
    expect(st(g).phase).toBe("resources");
    return { ...g, state: { ...st(g), current: "alice" } };
  }

  it("prices units from the cheapest end and charges for each", () => {
    expect(unitPrice("coal", 24)).toBe(1);
    expect(unitPrice("coal", 1)).toBe(8);
    expect(unitPrice("uranium", 1)).toBe(16);
    const g = started(IDS);
    expect(resourceCost(st(g), "coal", 3)).toBe(
      unitPrice("coal", 24) + unitPrice("coal", 23) + unitPrice("coal", 22),
    );
  });

  it("buys fuel into a plant, up to its capacity", () => {
    let g = resourcesWith(5); // coal, holds 2
    g = reduce(g, { type: "buyResource", plant: 5, units: 2 }, "alice");
    expect(st(g).plants.alice[0].stored).toBe(2);
    expect(st(g).resources.coal).toBe(22);
    expect(() => reduce(g, { type: "buyResource", plant: 5, units: 1 }, "alice")).toThrow(/holds/);
  });

  it("refuses fuel for plants that don't use it", () => {
    const g = resourcesWith(6); // eco
    expect(() => reduce(g, { type: "buyResource", plant: 6, units: 1 }, "alice")).toThrow(
      /doesn't use fuel/,
    );
  });
});

describe("building", () => {
  it("charges the slot cost for a first city and adds connection costs after", () => {
    const g0 = toBuildPhase(started(IDS));
    expect(st(g0).phase).toBe("build");
    const first = st(g0).current!;
    const second = st(g0).order.find((p) => p !== first)!;

    // A player's first city has no connection cost.
    let g = actAsCurrent(g0, { type: "buildCity", city: "northwick" });
    expect(st(g).money[first]).toBe(40);

    // The other player's first house in a city that already has one costs the second slot price.
    expect(buildCost(st(g), second, "northwick")).toBe(15);

    // The next city is linked from northwick, so the connection cost is added.
    const linked = distancesFrom(["northwick"]).harrowgate;
    expect(buildCost(st(g), first, "harrowgate")).toBe(10 + linked);
    g = actAsCurrent(g, { type: "buildCity", city: "harrowgate" });
    expect(st(g).money[first]).toBe(40 - (10 + linked));
  });

  it("stops one player building twice in a city", () => {
    let g = toBuildPhase(started(IDS));
    g = actAsCurrent(g, { type: "buildCity", city: "northwick" });
    expect(() => actAsCurrent(g, { type: "buildCity", city: "northwick" })).toThrow(/already/);
  });

  it("requires money", () => {
    const g = toBuildPhase(started(IDS));
    const s = st(g);
    const poor = { ...g, state: { ...s, money: { ...s.money, [s.current!]: 5 } } };
    expect(() => actAsCurrent(poor, { type: "buildCity", city: "northwick" })).toThrow(/costs/);
  });
});

describe("bureaucracy and rounds", () => {
  it("pays the income for cities powered, and fuel is used up", () => {
    let g = started(IDS);
    const s = st(g);
    g = {
      ...g,
      state: {
        ...s,
        plants: { ...s.plants, alice: [{ number: 6, stored: 0 }] }, // eco, 1 city
        houses: { northwick: ["alice"] },
      },
    };
    g = toBuildPhase(g);
    g = { ...g, state: { ...st(g), phase: "bureaucracy", current: "alice", done: [] } };
    const before = st(g).money.alice;
    g = reduce(g, { type: "power", plants: [6] }, "alice");
    expect(st(g).money.alice - before).toBe(18);
  });

  it("refuses to run a fuel plant with no fuel", () => {
    let g = started(IDS);
    const s = st(g);
    g = {
      ...g,
      state: {
        ...s,
        plants: { ...s.plants, alice: [{ number: 5, stored: 0 }] },
        houses: { northwick: ["alice"] },
        phase: "bureaucracy",
        current: "alice",
        done: [],
      },
    };
    expect(() => reduce(g, { type: "power", plants: [5] }, "alice")).toThrow(/needs 1 fuel/);
  });

  it("starts a new round in order of cities, and refills fuel", () => {
    let g = started(IDS);
    const s = st(g);
    const [a, b] = s.order;
    g = {
      ...g,
      state: {
        ...s,
        houses: { northwick: [b], harrowgate: [b], vellmouth: [a] },
        resources: { ...s.resources, coal: 10 },
      },
    };
    g = toBuildPhase(g);
    g = finishRound(g);
    expect(st(g).round).toBe(2);
    expect(st(g).phase).toBe("auction");
    expect(st(g).order[0]).toBe(b);
    expect(st(g).resources.coal).toBe(10 + 3);
  });

  it("ends the game once a player reaches the city limit, and scores capacity", () => {
    let g = started(IDS);
    const s = st(g);
    const houses: Record<string, string[]> = {};
    // Two players, so the end threshold is 21 cities.
    expect(endCities(2)).toBe(21);
    for (const c of CITIES.slice(0, endCities(2))) houses[c.id] = ["alice"];
    g = {
      ...g,
      state: { ...s, houses, plants: { ...s.plants, alice: [{ number: 6, stored: 0 }] } },
    };
    g = toBuildPhase(g);
    g = finishRound(g);
    expect(g.status).toBe("finished");
    expect(st(g).results!.winners).toEqual(["alice"]);
  });
});

describe("random games", () => {
  // Deterministic random numbers so a failure can be reproduced.
  function seeded(seed: number): () => number {
    let x = seed;
    return () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x80000000;
    };
  }

  // Tries candidate actions in random order and applies the first one the rules accept.
  function playRandomAction(g: GameDoc, rnd: () => number): GameDoc {
    const s = st(g);
    const candidates: { pid: string; action: PowerGridAction }[] = [];
    const pick = <T,>(items: T[]): T => items[Math.floor(rnd() * items.length)];

    if (s.phase === "auction") {
      if (s.auction) {
        const bidder = s.auction.active[s.auction.turn];
        candidates.push({ pid: bidder, action: { type: "bid", amount: s.auction.price + 1 + Math.floor(rnd() * 6) } });
        candidates.push({ pid: bidder, action: { type: "fold" } });
      } else {
        const plant = pick([...s.market.current, ...s.market.future]);
        candidates.push({ pid: s.current!, action: { type: "nominate", plant } });
        candidates.push({ pid: s.current!, action: { type: "pass" } });
      }
    } else if (s.phase === "resources") {
      const owned = s.plants[s.current!] ?? [];
      for (const op of owned) {
        candidates.push({
          pid: s.current!,
          action: { type: "buyResource", plant: op.number, units: 1 + Math.floor(rnd() * 3) },
        });
      }
      candidates.push({ pid: s.current!, action: { type: "doneResources" } });
    } else if (s.phase === "build") {
      candidates.push({ pid: s.current!, action: { type: "buildCity", city: pick(CITIES).id } });
      candidates.push({ pid: s.current!, action: { type: "doneBuild" } });
    } else {
      const runnable = (s.plants[s.current!] ?? [])
        .filter((op) => op.stored >= plantData(op.number).inputs)
        .map((op) => op.number);
      candidates.push({ pid: s.current!, action: { type: "power", plants: runnable } });
      candidates.push({ pid: s.current!, action: { type: "power", plants: [] } });
    }

    for (const c of candidates) {
      try {
        return reduce(g, c.action, c.pid);
      } catch {
        // Not legal here; try the next candidate.
      }
    }
    throw new Error(`no legal action in ${s.phase}`);
  }

  function checkInvariants(s: PowerGridState) {
    for (const p of s.order) {
      expect(s.money[p]).toBeGreaterThanOrEqual(0);
      expect((s.plants[p] ?? []).length).toBeLessThanOrEqual(4);
    }
    for (const c of CITIES) {
      const houses = s.houses[c.id] ?? [];
      expect(houses.length).toBeLessThanOrEqual(3);
      expect(new Set(houses).size).toBe(houses.length);
    }
    expect(s.market.current.length).toBeLessThanOrEqual(4);
    expect(s.market.future.length).toBeLessThanOrEqual(4);
  }

  for (const [seed, players] of [
    [1, 2],
    [7, 3],
    [42, 4],
  ] as [number, number][]) {
    it(`plays a full game to the end (seed ${seed}, ${players} players)`, () => {
      const rnd = seeded(seed);
      const spy = jest.spyOn(Math, "random").mockImplementation(rnd);
      try {
        const ids = ["p1", "p2", "p3", "p4"].slice(0, players);
        let g = started(ids);
        for (let step = 0; step < 100000 && g.status !== "finished"; step++) {
          g = playRandomAction(g, rnd);
          checkInvariants(st(g));
        }
        expect(g.status).toBe("finished");
        expect(st(g).results!.winners.length).toBeGreaterThan(0);
      } finally {
        spy.mockRestore();
      }
    });
  }
});
