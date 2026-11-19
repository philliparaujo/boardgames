// Full-game simulation: plays complete Ticket to Ride games with a seeded random policy
// and checks invariants after every action. Failures report the seed and the action trail.
import { GameDoc } from "../../types";
import { CITIES, ROUTES, RouteData } from "./map/europe";
import { TICKETS } from "./map/tickets";
import { reduce, routeBlockReason } from "./rules";
import { CardColor, TRAIN_COLORS, TTRAction, TTRState } from "./types";

const PLAYER_COUNTS = [2, 3, 4, 5];
const GAMES_PER_COUNT = 13; // 4 counts x 13 = 52 games
const MAX_ACTIONS = 2000;
const TOTAL_CARDS = 110;
const TRAINS_PER_PLAYER = 45;
const STATIONS_PER_PLAYER = 3;
const PHASE_RANK: Record<TTRState["phase"], number> = { setup: 0, playing: 1, finished: 2 };

interface Step {
  playerId: string;
  action: TTRAction;
}

interface GameStat {
  seed: number;
  players: number;
  actions: number;
  turns: number;
}

const stats: GameStat[] = [];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function waitingGame(ids: string[]): GameDoc {
  return {
    gameType: "ticketToRide",
    maxPlayers: 5,
    createdAt: 0,
    createdBy: ids[0],
    status: "waiting",
    players: ids.map((id) => ({ id, name: id })),
  };
}

function stateOf(game: GameDoc): TTRState {
  return game.state as TTRState;
}

function subsetsOf(ids: number[]): number[][] {
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    out.push(ids.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return out;
}

function countCards(hand: CardColor[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of hand) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}

// Payments that are plausibly legal: one color (or locomotives) and exactly `length` cards,
// using at least `locosNeeded` locomotives (ferries). The reducer decides actual legality.
function paymentOptions(
  hand: Record<string, number>,
  length: number,
  colors: CardColor[],
  locosNeeded: number,
): CardColor[][] {
  const out: CardColor[][] = [];
  const locos = hand.loco ?? 0;
  for (const c of colors) {
    if (c === "loco") {
      if (locos >= length) out.push(Array(length).fill("loco") as CardColor[]);
      continue;
    }
    const locosUsed = Math.max(locosNeeded, length - (hand[c] ?? 0));
    const colorCards = length - locosUsed;
    if (colorCards < 0 || colorCards > (hand[c] ?? 0) || locosUsed > locos) continue;
    out.push([...(Array(colorCards).fill(c) as CardColor[]), ...(Array(locosUsed).fill("loco") as CardColor[])]);
  }
  return out;
}

// Every action that might be legal for the current position. Illegal ones are filtered
// by trying them through the reducer (it throws and leaves the state unchanged).
function candidateSteps(s: TTRState): Step[] {
  const steps: Step[] = [];
  for (const pid of Object.keys(s.offers)) {
    const offer = s.offers[pid];
    for (const ids of subsetsOf(offer.ids)) {
      if (ids.length >= offer.min) steps.push({ playerId: pid, action: { type: "keepTickets", ids } });
    }
  }
  if (s.phase !== "playing") return steps;

  const actor = s.order[s.current];
  if (s.offers[actor]) return steps; // must keep tickets before anything else

  const tunnel = s.pendingTunnel;
  if (tunnel) {
    steps.push({ playerId: actor, action: { type: "declineTunnel" } });
    const hand = s.hands[actor];
    const color = hand.filter((c) => c === tunnel.payColor && c !== "loco").length;
    for (let colored = 0; colored <= Math.min(color, tunnel.extra); colored++) {
      const payment = [
        ...(Array(colored).fill(tunnel.payColor) as CardColor[]),
        ...(Array(tunnel.extra - colored).fill("loco") as CardColor[]),
      ];
      steps.push({ playerId: actor, action: { type: "payTunnel", payment } });
    }
    return steps;
  }
  steps.push({ playerId: actor, action: { type: "pass" } });

  s.faceUp.forEach((_, slot) => steps.push({ playerId: actor, action: { type: "drawFaceUp", slot } }));
  steps.push({ playerId: actor, action: { type: "drawDeck" } });
  steps.push({ playerId: actor, action: { type: "drawTickets" } });

  const hand = countCards(s.hands[actor]);
  const colorsFor = (route: RouteData): CardColor[] =>
    route.color === "gray" ? [...TRAIN_COLORS, "loco"] : [route.color, "loco"];
  for (const route of ROUTES as RouteData[]) {
    if (routeBlockReason(s, actor, route) !== null) continue;
    for (const payment of paymentOptions(hand, route.length, colorsFor(route), route.locos)) {
      steps.push({ playerId: actor, action: { type: "claimRoute", routeId: route.id, payment } });
    }
  }

  const owned = Object.values(s.stations).filter((o) => o === actor).length;
  if (owned < STATIONS_PER_PLAYER) {
    const free = CITIES.map((c) => c.id).filter((c) => !s.stations[c]);
    for (const payment of paymentOptions(hand, owned + 1, [...TRAIN_COLORS, "loco"], 0)) {
      for (const city of free) {
        steps.push({ playerId: actor, action: { type: "placeStation", city, payment } });
      }
    }
  }
  return steps;
}

function tryStep(game: GameDoc, step: Step): GameDoc | null {
  try {
    return reduce(game, step.action, step.playerId);
  } catch {
    return null;
  }
}

function describeStep(step: Step): string {
  const a = step.action;
  switch (a.type) {
    case "keepTickets":
      return `${step.playerId} keepTickets [${a.ids.join(",")}]`;
    case "drawFaceUp":
      return `${step.playerId} drawFaceUp slot=${a.slot}`;
    case "claimRoute":
      return `${step.playerId} claimRoute ${a.routeId} pay=${a.payment.join(",")}`;
    case "placeStation":
      return `${step.playerId} placeStation ${a.city} pay=${a.payment.join(",")}`;
    default:
      return `${step.playerId} ${a.type}`;
  }
}

function summarize(s: TTRState): string {
  return JSON.stringify({
    phase: s.phase,
    current: s.order[s.current],
    drawnThisTurn: s.drawnThisTurn,
    lastRoundBy: s.lastRoundBy,
    trains: s.trains,
    deck: s.deck.length,
    discard: s.discard.length,
    faceUp: s.faceUp,
    hands: Object.fromEntries(Object.entries(s.hands).map(([k, v]) => [k, v.length])),
    offers: s.offers,
    owners: Object.keys(s.owners).length,
    stations: s.stations,
  });
}

// Invariants that must hold in every state.
function checkState(s: TTRState, game: GameDoc, n: number) {
  const fail = (msg: string) => {
    throw new Error(`invariant: ${msg}`);
  };
  const order = s.order;
  if (order.length !== n) fail(`order has ${order.length} players, expected ${n}`);
  if (game.status !== (s.phase === "finished" ? "finished" : "started")) {
    fail(`game.status=${game.status} but phase=${s.phase}`);
  }
  if (s.current < 0 || s.current >= n) fail(`current index ${s.current} out of range`);
  if (s.drawnThisTurn < 0 || s.drawnThisTurn > 2) fail(`drawnThisTurn=${s.drawnThisTurn}`);
  if (s.phase === "setup" && s.current !== 0) fail("current moved during setup");

  // Card conservation: 12 of each color and 14 locomotives.
  const counts: Record<string, number> = {};
  const add = (c: CardColor) => (counts[c] = (counts[c] ?? 0) + 1);
  s.deck.forEach(add);
  s.discard.forEach(add);
  s.faceUp.forEach(add);
  for (const pid of order) (s.hands[pid] ?? []).forEach(add);
  if (s.pendingTunnel) {
    s.pendingTunnel.payment.forEach(add);
    s.pendingTunnel.revealed.forEach(add);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total !== TOTAL_CARDS) fail(`card total ${total}, expected ${TOTAL_CARDS}`);
  for (const c of TRAIN_COLORS) {
    if ((counts[c] ?? 0) !== 12) fail(`${c} cards = ${counts[c] ?? 0}, expected 12`);
  }
  if ((counts.loco ?? 0) !== 14) fail(`loco cards = ${counts.loco ?? 0}, expected 14`);
  if (s.faceUp.length > 5) fail(`face-up row has ${s.faceUp.length} cards`);
  if (s.faceUp.filter((c) => c === "loco").length >= 3) {
    // Allowed only when the cards left can't make a row with fewer than 3 locomotives.
    const pool = [...s.faceUp, ...s.deck, ...s.discard];
    const nonLoco = pool.filter((c) => c !== "loco").length;
    if (nonLoco >= Math.min(5, pool.length) - 2) fail("3+ locomotives face up");
  }

  // Ticket conservation: every destination ticket is in exactly one place.
  const ticketIds = [
    ...s.ticketDeck,
    ...s.longDeck,
    ...(s.box ?? []),
    ...Object.values(s.tickets).flat(),
    ...Object.values(s.offers).flatMap((o) => o.ids),
  ];
  if (new Set(ticketIds).size !== ticketIds.length) fail("a destination ticket appears twice");
  if (ticketIds.length !== TICKETS.length) fail(`ticket total ${ticketIds.length}, expected ${TICKETS.length}`);

  // Routes: valid, single owner, trains consistent with ownership.
  const routeById = new Map(ROUTES.map((r) => [r.id, r]));
  const trainsUsed: Record<string, number> = {};
  const ownersByGroup: Record<string, Set<string>> = {};
  const perPlayerGroup = new Set<string>();
  for (const [routeId, owner] of Object.entries(s.owners)) {
    const route = routeById.get(routeId);
    if (!route) fail(`owned unknown route ${routeId}`);
    if (!order.includes(owner)) fail(`route ${routeId} owned by non-player ${owner}`);
    trainsUsed[owner] = (trainsUsed[owner] ?? 0) + route!.length;
    (ownersByGroup[route!.group] ??= new Set()).add(owner);
    const key = `${owner}|${route!.group}`;
    if (perPlayerGroup.has(key)) fail(`${owner} owns both routes between ${route!.group}`);
    perPlayerGroup.add(key);
  }
  if (n <= 3) {
    for (const [group, owners] of Object.entries(ownersByGroup)) {
      if (owners.size > 1) fail(`2-3 player game: both parallel routes of ${group} claimed`);
    }
  }
  for (const pid of order) {
    const trains = s.trains[pid];
    if (trains === undefined) fail(`no train count for ${pid}`);
    if (trains < 0) fail(`${pid} has negative trains (${trains})`);
    if (trains !== TRAINS_PER_PLAYER - (trainsUsed[pid] ?? 0)) {
      fail(`${pid} trains=${trains} but owns ${trainsUsed[pid] ?? 0} route length`);
    }
    if (!Array.isArray(s.hands[pid])) fail(`no hand for ${pid}`);
  }

  // Stations: valid city, valid owner, at most 3 per player.
  const cityIds = new Set(CITIES.map((c) => c.id));
  const stationCount: Record<string, number> = {};
  for (const [city, owner] of Object.entries(s.stations)) {
    if (!cityIds.has(city)) fail(`station in unknown city ${city}`);
    if (!order.includes(owner)) fail(`station in ${city} owned by non-player ${owner}`);
    stationCount[owner] = (stationCount[owner] ?? 0) + 1;
  }
  for (const [pid, count] of Object.entries(stationCount)) {
    if (count > STATIONS_PER_PLAYER) fail(`${pid} has ${count} stations`);
  }

  // Offers: during play only the current player can have one.
  if (s.phase === "playing") {
    for (const pid of Object.keys(s.offers)) {
      if (pid !== order[s.current]) fail(`offer held by ${pid} but ${order[s.current]} is current`);
    }
  }

  // Last round: triggered only by a player with 2 or fewer trains.
  if (s.lastRoundBy !== null && s.trains[s.lastRoundBy] > 2) {
    fail(`last round started by ${s.lastRoundBy} with ${s.trains[s.lastRoundBy]} trains`);
  }

  // Results: present exactly when finished.
  if (s.phase === "finished") {
    if (s.lastRoundBy === null) fail("game finished without a last round");
    // The player who triggered the last round plays the final turn.
    if (order[s.current] !== s.lastRoundBy) {
      fail(`game finished on ${order[s.current]}'s turn, but last round was by ${s.lastRoundBy}`);
    }
    if (s.finalTurnsLeft !== 0) fail(`finished with ${s.finalTurnsLeft} final turns left`);
    if (!s.results) fail("finished game has no results");
    for (const pid of order) {
      const r = s.results![pid];
      if (!r) fail(`no result for ${pid}`);
      if (![r.routePoints, r.ticketPoints, r.stationPoints, r.total].every(Number.isFinite)) {
        fail(`non-finite score for ${pid}`);
      }
      const built = Object.values(s.stations).filter((o) => o === pid).length;
      if (r.stationPoints !== 4 * (STATIONS_PER_PLAYER - built)) fail(`station points wrong for ${pid}`);
      for (const routeId of r.borrowedRoutes) {
        const owner = s.owners[routeId];
        if (!owner || owner === pid) fail(`${pid} borrowed route ${routeId} owned by ${owner}`);
      }
    }
  } else if (s.results !== null) {
    fail("results present before game finished");
  }
}

// Invariants that relate a state to the one before it and the action taken.
function checkTransition(prev: TTRState, s: TTRState, step: Step, n: number) {
  const fail = (msg: string) => {
    throw new Error(`invariant: ${msg}`);
  };
  if (PHASE_RANK[s.phase] < PHASE_RANK[prev.phase]) fail(`phase went back: ${prev.phase} -> ${s.phase}`);
  if (prev.phase === "setup" && s.phase === "playing" && Object.keys(s.offers).length > 0) {
    fail("setup ended while tickets were still offered");
  }
  if (prev.lastRoundBy !== null && s.lastRoundBy !== prev.lastRoundBy) fail("lastRoundBy changed");

  if (prev.phase === "playing" && s.phase === "playing" && s.current !== prev.current) {
    if (s.current !== (prev.current + 1) % n) {
      fail(`turn jumped from index ${prev.current} to ${s.current} (n=${n})`);
    }
    if (s.drawnThisTurn !== 0) fail("new turn started with drawnThisTurn != 0");
    if (prev.lastRoundBy !== null && s.finalTurnsLeft !== (prev.finalTurnsLeft ?? 0) - 1) {
      fail(`final turns went from ${prev.finalTurnsLeft} to ${s.finalTurnsLeft}`);
    }
    if (prev.lastRoundBy === null && s.lastRoundBy !== null && s.finalTurnsLeft !== n) {
      fail(`last round started with ${s.finalTurnsLeft} final turns, expected ${n}`);
    }
  }
  if (prev.phase === "playing" && s.phase === "finished" && prev.lastRoundBy === null) {
    fail("game ended without a last round");
  }
  if (prev.lastRoundBy === null && s.lastRoundBy !== null) {
    if (s.lastRoundBy !== step.playerId) fail(`last round set by ${step.playerId}, recorded for ${s.lastRoundBy}`);
  }
  // A non-turn-ending action must leave the same player on turn.
  if (prev.phase === "playing" && s.phase === "playing" && s.current === prev.current) {
    if (step.playerId !== s.order[s.current]) fail(`${step.playerId} acted off-turn`);
  }
}

function playGame(n: number, seed: number) {
  const shuffleRng = mulberry32(seed);
  const policyRng = mulberry32(seed * 7919 + 17);
  const spy = jest.spyOn(Math, "random").mockImplementation(shuffleRng);
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const trail: string[] = [];
  let actions = 0;
  let turns = 0;
  let game: GameDoc = waitingGame(ids);

  const header = `seed=${seed} players=${n}`;
  const report = (msg: string) =>
    new Error(
      `${header} after ${actions} actions: ${msg}\n` +
        `last actions:\n  ${trail.slice(-15).join("\n  ")}\n` +
        (game.state ? `state: ${summarize(stateOf(game))}` : ""),
    );

  try {
    game = reduce(game, { type: "start" }, ids[0]);
    checkState(stateOf(game), game, n);

    while (game.status !== "finished") {
      if (actions >= MAX_ACTIONS) throw report(`game not finished after ${MAX_ACTIONS} actions`);
      const prev = stateOf(game);
      const legal: { step: Step; next: GameDoc }[] = [];
      for (const step of candidateSteps(prev)) {
        const next = tryStep(game, step);
        if (next) legal.push({ step, next });
      }
      if (legal.length === 0) throw report("stuck: no legal action available");

      const chosen = legal[Math.floor(policyRng() * legal.length)];
      trail.push(`[${actions + 1}] ${describeStep(chosen.step)}`);
      const s = stateOf(chosen.next);
      try {
        checkTransition(prev, s, chosen.step, n);
        checkState(s, chosen.next, n);
      } catch (e) {
        throw report((e as Error).message);
      }
      if (s.current !== prev.current || s.phase !== prev.phase) turns++;
      game = chosen.next;
      actions++;
    }
  } finally {
    spy.mockRestore();
  }

  stats.push({ seed, players: n, actions, turns });
}

describe("Ticket to Ride full-game simulation", () => {
  afterAll(() => {
    const byCount: Record<number, number> = {};
    for (const g of stats) byCount[g.players] = (byCount[g.players] ?? 0) + 1;
    const avg = stats.reduce((a, g) => a + g.actions, 0) / Math.max(stats.length, 1);
    console.log(
      `Simulation: ${stats.length} games finished. Player counts: ${JSON.stringify(byCount)}. ` +
        `Average actions per game: ${avg.toFixed(1)}.`,
    );
  });

  for (const n of PLAYER_COUNTS) {
    for (let i = 0; i < GAMES_PER_COUNT; i++) {
      const seed = n * 1000 + i + 1;
      test(`plays a ${n}-player game to the end (seed ${seed})`, () => {
        playGame(n, seed);
      });
    }
  }
});
