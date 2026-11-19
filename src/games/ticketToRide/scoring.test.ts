import { ROUTES, RouteData } from "./map/europe";
import { TICKETS } from "./map/tickets";
import { isConnected, longestTrail, scoreGame, scoreTickets, winnersOf } from "./scoring";
import { PlayerScore, TTRState } from "./types";

// Hand-built route helper. Only the fields longestTrail reads matter here.
function route(id: number, from: string, to: string, length: number): RouteData {
  return { id: `r${id}`, from, to, length, color: "gray", locos: 0, tunnel: false, group: "" } as RouteData;
}

// Reference implementation: exhaustive search with no pruning or budget.
function bruteForce(routes: RouteData[]): number {
  const cities = Array.from(new Set<string>(routes.flatMap((r) => [r.from, r.to])));
  const used = new Array(routes.length).fill(false);
  let best = 0;
  const walk = (city: string, total: number) => {
    best = Math.max(best, total);
    routes.forEach((r, i) => {
      if (used[i] || (r.from !== city && r.to !== city)) return;
      used[i] = true;
      walk(r.from === city ? r.to : r.from, total + r.length);
      used[i] = false;
    });
  };
  for (const c of cities) walk(c, 0);
  return best;
}

// Small deterministic PRNG so the random cases are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CITY_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];

describe("longestTrail", () => {
  it("returns 0 with no routes", () => {
    expect(longestTrail([])).toBe(0);
  });

  it("sums a simple path", () => {
    const routes = [route(1, "A", "B", 3), route(2, "B", "C", 4), route(3, "C", "D", 2)];
    expect(longestTrail(routes)).toBe(9);
  });

  it("takes the longer branch of a fork", () => {
    const routes = [route(1, "A", "B", 2), route(2, "B", "C", 2), route(3, "B", "D", 5)];
    expect(longestTrail(routes)).toBe(7);
  });

  it("never reuses a route, even in a cycle", () => {
    const routes = [route(1, "A", "B", 1), route(2, "B", "C", 2), route(3, "C", "A", 3)];
    expect(longestTrail(routes)).toBe(6);
  });

  it("counts parallel routes separately", () => {
    const routes = [route(1, "A", "B", 4), route(2, "A", "B", 4)];
    expect(longestTrail(routes)).toBe(8);
  });

  it("doesn't join disconnected pieces", () => {
    const routes = [route(1, "A", "B", 5), route(2, "C", "D", 6)];
    expect(longestTrail(routes)).toBe(6);
  });

  it("matches brute force on random small graphs", () => {
    const rand = rng(12345);
    for (let trial = 0; trial < 300; trial++) {
      const routeCount = 1 + Math.floor(rand() * 7);
      const routes: RouteData[] = [];
      for (let i = 0; i < routeCount; i++) {
        const a = CITY_NAMES[Math.floor(rand() * CITY_NAMES.length)];
        let b = CITY_NAMES[Math.floor(rand() * CITY_NAMES.length)];
        if (b === a) b = CITY_NAMES[(CITY_NAMES.indexOf(a) + 1) % CITY_NAMES.length];
        routes.push(route(i, a, b, 1 + Math.floor(rand() * 6)));
      }
      expect(longestTrail(routes)).toBe(bruteForce(routes));
    }
  });

  it("finishes quickly on a dense ~45-route network", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    const routes: RouteData[] = [];
    let id = 0;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        routes.push(route(id, names[i], names[j], 1 + ((id * 7) % 6)));
        id++;
      }
    }
    expect(routes.length).toBe(45);

    const start = Date.now();
    const result = longestTrail(routes);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(routes.reduce((s, r) => s + r.length, 0));
  });
});

describe("isConnected", () => {
  it("follows routes only", () => {
    const routes = [route(1, "A", "B", 1), route(2, "B", "C", 1), route(3, "D", "E", 1)];
    expect(isConnected(routes, "A", "C")).toBe(true);
    expect(isConnected(routes, "A", "E")).toBe(false);
    expect(isConnected([], "Lisboa", "Moskva")).toBe(false);
  });
});

// ---- Game scoring on the real map ----

function routeBetween(a: string, b: string): RouteData {
  const group = [a, b].sort().join("|");
  const r = ROUTES.find((x) => x.group === group);
  if (!r) throw new Error(`No route ${a}-${b}`);
  return r;
}

function ticketId(from: string, to: string): number {
  const t = TICKETS.find((x) => (x.from === from && x.to === to) || (x.from === to && x.to === from));
  if (!t) throw new Error(`No ticket ${from}-${to}`);
  return t.id;
}

function endState(opts: {
  owners?: Record<string, string>;
  stations?: Record<string, string>;
  tickets?: Record<string, number[]>;
}): TTRState {
  return {
    phase: "finished",
    order: ["a", "b"],
    current: 0,
    deck: [],
    discard: [],
    faceUp: [],
    hands: { a: [], b: [] },
    trains: { a: 0, b: 0 },
    owners: opts.owners ?? {},
    stations: opts.stations ?? {},
    ticketDeck: [],
    longDeck: [],
    tickets: { a: [], b: [], ...(opts.tickets ?? {}) },
    offers: {},
    drawnThisTurn: 0,
    lastRoundBy: "a",
    results: null,
    log: [],
  };
}

describe("stations at scoring", () => {
  // Ticket Brest–Marseille (7). Routes: Brest–Paris (a), Paris–Marseille (b).
  const brestParis = routeBetween("Brest", "Paris");
  const parisMarseille = routeBetween("Paris", "Marseille");
  const ticket = ticketId("Brest", "Marseille");

  it("without a station, an opponent's route doesn't help", () => {
    const s = endState({
      owners: { [brestParis.id]: "a", [parisMarseille.id]: "b" },
      tickets: { a: [ticket] },
    });
    expect(scoreTickets(s, "a").points).toBe(-TICKETS[ticket].points);
  });

  it("a station borrows one opponent route into its city", () => {
    const s = endState({
      owners: { [brestParis.id]: "a", [parisMarseille.id]: "b" },
      stations: { Paris: "a" },
      tickets: { a: [ticket] },
    });
    const outcome = scoreTickets(s, "a");
    expect(outcome.points).toBe(TICKETS[ticket].points);
    expect(outcome.borrowed).toEqual([parisMarseille.id]);
  });

  it("a station in a city at the other end of the route also works", () => {
    const s = endState({
      owners: { [brestParis.id]: "a", [parisMarseille.id]: "b" },
      stations: { Marseille: "a" },
      tickets: { a: [ticket] },
    });
    expect(scoreTickets(s, "a").points).toBe(TICKETS[ticket].points);
  });

  it("a station is not a free jump to any city", () => {
    // The old implementation let a station at Brest jump straight to Marseille.
    const s = endState({ stations: { Brest: "a" }, tickets: { a: [ticket] } });
    expect(scoreTickets(s, "a").points).toBe(-TICKETS[ticket].points);
  });

  it("a station borrows only one route, the same one for every ticket, chosen for the most points", () => {
    // "a" owns Brest–Paris and Zurich–Venezia; "b" owns Paris–Marseille and Paris–Zurich.
    // Station at Paris. Borrowing Paris–Zurich completes Brest–Venezia (+8) and fails
    // Brest–Marseille (-7) = +1; borrowing Paris–Marseille gives +7 - 8 = -1.
    const parisZurich = routeBetween("Paris", "Zurich");
    const zurichVenezia = routeBetween("Zurich", "Venezia");
    const s = endState({
      owners: {
        [brestParis.id]: "a",
        [zurichVenezia.id]: "a",
        [parisMarseille.id]: "b",
        [parisZurich.id]: "b",
      },
      stations: { Paris: "a" },
      tickets: { a: [ticket, ticketId("Brest", "Venezia")] },
    });
    const outcome = scoreTickets(s, "a");
    expect(outcome.borrowed).toEqual([parisZurich.id]);
    expect(outcome.completed).toBe(1);
    expect(outcome.points).toBe(1);
  });

  it("two stations can borrow two routes", () => {
    // Stations at Paris and Zurich: Paris–Zurich (borrowed at Paris) and Zurich–Marseille
    // (borrowed at Zurich) complete Brest–Marseille.
    const parisZurich = routeBetween("Paris", "Zurich");
    const zurichMarseille = routeBetween("Zurich", "Marseille");
    const s = endState({
      owners: { [brestParis.id]: "a", [parisZurich.id]: "b", [zurichMarseille.id]: "b" },
      stations: { Paris: "a", Zurich: "a" },
      tickets: { a: [ticket] },
    });
    const outcome = scoreTickets(s, "a");
    expect(outcome.points).toBe(TICKETS[ticket].points);
    expect(outcome.borrowed.sort()).toEqual([parisZurich.id, zurichMarseille.id].sort());
  });

  it("picks the borrow that completes the ticket", () => {
    // Station at Paris. Opponent owns Paris–Marseille and Paris–Zurich.
    // Brest–Marseille only needs Paris–Marseille.
    const parisZurich = routeBetween("Paris", "Zurich");
    const s = endState({
      owners: { [brestParis.id]: "a", [parisZurich.id]: "b", [parisMarseille.id]: "b" },
      stations: { Paris: "a" },
      tickets: { a: [ticket] },
    });
    expect(scoreTickets(s, "a").borrowed).toEqual([parisMarseille.id]);
  });

  it("can't borrow a route nobody owns", () => {
    const s = endState({
      owners: { [brestParis.id]: "a" },
      stations: { Paris: "a" },
      tickets: { a: [ticket] },
    });
    expect(scoreTickets(s, "a").points).toBe(-TICKETS[ticket].points);
  });

  it("scores 4 points per station in reserve and ignores stations for the longest path", () => {
    const s = endState({
      owners: { [brestParis.id]: "a", [parisMarseille.id]: "b" },
      stations: { Paris: "a" },
    });
    const results = scoreGame(s);
    expect(results.a.stationPoints).toBe(8); // 2 stations unused
    expect(results.b.stationPoints).toBe(12);
    expect(results.a.longestRoute).toBe(brestParis.length);
    expect(results.a.total).toBe(4 + 8 + 0); // Brest–Paris (3) = 4 pts; longest is b's (4)
    expect(results.b.longestBonus).toBe(true);
    expect(results.b.total).toBe(7 + 12 + 10);
  });

  it("ties for the longest path all get the bonus", () => {
    const londonEdinburgh = ROUTES.filter((r) => r.group === routeBetween("London", "Edinburgh").group);
    const s = endState({ owners: { [londonEdinburgh[0].id]: "a", [londonEdinburgh[1].id]: "b" } });
    const results = scoreGame(s);
    expect(results.a.longestBonus).toBe(true);
    expect(results.b.longestBonus).toBe(true);
  });
});

describe("winner tie-breaks", () => {
  const base: PlayerScore = {
    routePoints: 0,
    ticketPoints: 0,
    ticketsCompleted: 0,
    ticketsFailed: 0,
    stationsBuilt: 0,
    stationPoints: 0,
    borrowedRoutes: [],
    longestRoute: 0,
    longestBonus: false,
    total: 50,
    winner: false,
  };

  it("highest total wins", () => {
    expect(winnersOf({ a: { ...base, total: 60 }, b: base })).toEqual(["a"]);
  });
  it("then most completed tickets", () => {
    expect(winnersOf({ a: base, b: { ...base, ticketsCompleted: 2 } })).toEqual(["b"]);
  });
  it("then fewest stations built", () => {
    expect(winnersOf({ a: { ...base, stationsBuilt: 1 }, b: base })).toEqual(["b"]);
  });
  it("then the European Express", () => {
    expect(winnersOf({ a: { ...base, longestBonus: true }, b: base })).toEqual(["a"]);
  });
  it("otherwise a shared win", () => {
    expect(winnersOf({ a: base, b: base })).toEqual(["a", "b"]);
  });
});
