import { ROUTES, RouteData } from "./map/europe";
import { TICKETS } from "./map/tickets";
import { PlayerScore, TTRState } from "./types";

// Points for a claimed route, by length.
export const ROUTE_POINTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 10,
  6: 15,
  7: 18,
  8: 21,
};

// European Express bonus for the longest continuous path.
export const LONGEST_ROUTE_BONUS = 10;
// Points for each station still in reserve at the end of the game.
export const STATION_RESERVE_POINTS = 4;
const STATIONS_PER_PLAYER = 3;

export function routePoints(length: number): number {
  return ROUTE_POINTS[length] ?? 0;
}

// Cities where a player has built a station.
export function stationsOf(state: TTRState, playerId: string): string[] {
  return Object.entries(state.stations)
    .filter(([, owner]) => owner === playerId)
    .map(([city]) => city);
}

export interface TicketOutcome {
  points: number; // completed tickets added, failed ones subtracted
  completed: number;
  failed: number;
  completedIds: number[];
  borrowed: string[]; // opponent route ids the stations use
}

// Scores a player's destination tickets. Each station lets its owner use one route
// claimed by another player into or out of the station's city, the same route for all
// tickets. The owner chooses at game end, so every assignment is tried and the best kept
// (most points, then most completed tickets).
export function scoreTickets(state: TTRState, playerId: string): TicketOutcome {
  const owned = ROUTES.filter((r) => state.owners[r.id] === playerId);
  const ticketIds = state.tickets[playerId] ?? [];

  // For each station: the opponent routes it could borrow, plus null for "none".
  const options: (RouteData | null)[][] = stationsOf(state, playerId).map((city) => [
    null,
    ...ROUTES.filter((r) => {
      const owner = state.owners[r.id];
      return owner !== undefined && owner !== playerId && (r.from === city || r.to === city);
    }),
  ]);

  let best: TicketOutcome | null = null;
  const choice: (RouteData | null)[] = [];
  const evaluate = () => {
    const borrowed = choice.filter((r): r is RouteData => r !== null);
    const outcome = ticketOutcome([...owned, ...borrowed], ticketIds);
    outcome.borrowed = borrowed.map((r) => r.id);
    // Prefer more points, then more completed tickets, then fewer borrowed routes
    // (so only routes that actually help are reported).
    const b = best;
    if (
      !b ||
      outcome.points > b.points ||
      (outcome.points === b.points &&
        (outcome.completed > b.completed ||
          (outcome.completed === b.completed && outcome.borrowed.length < b.borrowed.length)))
    ) {
      best = outcome;
    }
  };
  const search = (i: number) => {
    if (i === options.length) return evaluate();
    for (const option of options[i]) {
      choice[i] = option;
      search(i + 1);
    }
  };
  search(0);
  return best as unknown as TicketOutcome;
}

function ticketOutcome(routes: RouteData[], ticketIds: number[]): TicketOutcome {
  const find = components(routes);
  const outcome: TicketOutcome = { points: 0, completed: 0, failed: 0, completedIds: [], borrowed: [] };
  for (const id of ticketIds) {
    const ticket = TICKETS[id];
    if (!ticket) continue;
    if (find(ticket.from) === find(ticket.to)) {
      outcome.points += ticket.points;
      outcome.completed++;
      outcome.completedIds.push(id);
    } else {
      outcome.points -= ticket.points;
      outcome.failed++;
    }
  }
  return outcome;
}

// Union-find over the cities touched by `routes`. Returns a component lookup.
function components(routes: RouteData[]): (city: string) => string {
  const parent = new Map<string, string>();
  const find = (city: string): string => {
    let root = city;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) as string;
    // Path compression.
    let node = city;
    while (parent.has(node) && parent.get(node) !== root) {
      const next = parent.get(node) as string;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  for (const r of routes) {
    if (!parent.has(r.from)) parent.set(r.from, r.from);
    if (!parent.has(r.to)) parent.set(r.to, r.to);
    parent.set(find(r.from), find(r.to));
  }
  return find;
}

export function scoreGame(state: TTRState): Record<string, PlayerScore> {
  const scores: Record<string, PlayerScore> = {};

  for (const playerId of state.order) {
    const owned = ROUTES.filter((r) => state.owners[r.id] === playerId);
    const routePts = owned.reduce((sum, r) => sum + routePoints(r.length), 0);
    const tickets = scoreTickets(state, playerId);
    const built = stationsOf(state, playerId).length;

    scores[playerId] = {
      routePoints: routePts,
      ticketPoints: tickets.points,
      ticketsCompleted: tickets.completed,
      ticketsFailed: tickets.failed,
      stationsBuilt: built,
      stationPoints: Math.max(0, STATIONS_PER_PLAYER - built) * STATION_RESERVE_POINTS,
      borrowedRoutes: tickets.borrowed,
      // Stations and borrowed routes don't count for the longest path.
      longestRoute: longestTrail(owned),
      longestBonus: false,
      total: 0,
      winner: false,
    };
  }

  // European Express: the longest continuous path. Tied players all get it.
  const best = Math.max(0, ...Object.values(scores).map((s) => s.longestRoute));
  for (const score of Object.values(scores)) {
    score.longestBonus = best > 0 && score.longestRoute === best;
    score.total =
      score.routePoints +
      score.ticketPoints +
      score.stationPoints +
      (score.longestBonus ? LONGEST_ROUTE_BONUS : 0);
  }

  for (const id of winnersOf(scores)) scores[id].winner = true;
  return scores;
}

// Winners: most points; ties go to most completed tickets, then fewest stations
// built, then the European Express bonus. Players still tied all win.
export function winnersOf(scores: Record<string, PlayerScore>): string[] {
  const keys = (s: PlayerScore) => [s.total, s.ticketsCompleted, -s.stationsBuilt, s.longestBonus ? 1 : 0];
  let winners: string[] = [];
  let bestKeys: number[] | null = null;
  for (const [id, score] of Object.entries(scores)) {
    const k = keys(score);
    const cmp = bestKeys ? compare(k, bestKeys) : 1;
    if (cmp > 0) {
      winners = [id];
      bestKeys = k;
    } else if (cmp === 0) {
      winners.push(id);
    }
  }
  return winners;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// Whether `routes` connect `from` and `to`. Stations aren't involved here; see scoreTickets.
export function isConnected(routes: RouteData[], from: string, to: string): boolean {
  const find = components(routes);
  return find(from) === find(to);
}

// Default cap on search steps (recursive walk calls) per longestTrail call. Keeps the
// worst case bounded; see the note on longestTrail.
export const LONGEST_TRAIL_STEP_BUDGET = 1_000_000;

// Length of the longest trail (no route used twice; cities may repeat) through the given
// routes. Stations don't count for the longest path.
//
// Method: depth-first search with branch-and-bound. At each node the upper bound is the
// current length plus the total length of routes not yet used; once that cannot beat the
// best trail found so far the subtree is skipped. Results are exact unless the step budget
// runs out, in which case the best trail found so far is returned. A player has at most
// 45 trains, so real networks are small.
export function longestTrail(
  routes: RouteData[],
  stepBudget: number = LONGEST_TRAIL_STEP_BUDGET,
): number {
  if (routes.length === 0) return 0;

  // Map city names to dense integer ids.
  const cityIndex = new Map<string, number>();
  const idOf = (city: string): number => {
    let id = cityIndex.get(city);
    if (id === undefined) {
      id = cityIndex.size;
      cityIndex.set(city, id);
    }
    return id;
  };

  const adjacency: { to: number; index: number; length: number }[][] = [];
  let remaining = 0;
  routes.forEach((r, index) => {
    const a = idOf(r.from);
    const b = idOf(r.to);
    while (adjacency.length < cityIndex.size) adjacency.push([]);
    adjacency[a].push({ to: b, index, length: r.length });
    adjacency[b].push({ to: a, index, length: r.length });
    remaining += r.length;
  });

  const usedEdges = new Array<boolean>(routes.length).fill(false);
  let best = 0;
  let steps = 0;

  const walk = (city: number, total: number) => {
    if (steps >= stepBudget) return;
    steps++;
    if (total > best) best = total;
    // Nothing reachable from here can exceed `best`.
    if (total + remaining <= best) return;

    for (const edge of adjacency[city]) {
      if (usedEdges[edge.index]) continue;
      usedEdges[edge.index] = true;
      remaining -= edge.length;
      walk(edge.to, total + edge.length);
      remaining += edge.length;
      usedEdges[edge.index] = false;
    }
  };

  for (let city = 0; city < adjacency.length; city++) walk(city, 0);
  return best;
}
