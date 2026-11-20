import { GameDoc, GamePlayer } from "../../types";
import { CITIES, EDGES, cityName } from "./map/map";
import { PLANT_NUMBERS, plantCapacity, plantData } from "./plants";
import {
  OwnedPlant,
  Phase,
  PowerGridAction,
  PowerGridState,
  Resource,
  RESOURCES,
  Results,
  Score,
} from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
const START_MONEY = 50;
// Must be at least the highest end threshold (21 cities for two players).
const MAX_CITIES = 21;
const MAX_PLANTS = 3;
const MARKET_ROW = 4;
const LOG_LIMIT = 40;

// Plants taken out of the deck at setup, by player count. Fewer players, fewer plants.
const REMOVED_PLANTS: Record<number, number> = { 2: 8, 3: 4, 4: 0 };

// Building cost of the first, second and third house in a city (before connection costs).
const SLOT_COST = [10, 15, 20];

// Market steps: from these city counts on, the step rises. Step 2 is from the 7th city (sourced);
// the Step 3 threshold is NOT sourced and is still a placeholder.
const STEP2_CITIES = 7;
const STEP3_CITIES = 12;

// The game ends at the end of a round in which some player has this many cities (sourced).
export function endCities(playerCount: number): number {
  return playerCount === 2 ? 21 : 17;
}

// Income by the number of cities powered (index = cities powered).
const PAYOUT = [
  10, 18, 26, 34, 41, 48, 54, 60, 65, 70, 74, 78, 82, 86, 89, 92, 95, 98, 101, 104, 107, 110,
];

// Resource market: stock cap, price range (cheapest when full, dearest when empty),
// and how many units come back each round, by step.
const CAP: Record<Resource, number> = { coal: 24, oil: 24, garbage: 24, uranium: 12 };
const PRICE: Record<Resource, [number, number]> = {
  coal: [1, 8],
  oil: [3, 14],
  garbage: [2, 10],
  uranium: [1, 16],
};
const REFILL: Record<Resource, number[]> = {
  coal: [3, 3, 4],
  oil: [2, 2, 3],
  garbage: [2, 2, 2],
  uranium: [1, 1, 1],
};
const START_STOCK: Record<Resource, number> = { coal: 24, oil: 18, garbage: 12, uranium: 6 };

// Applies one action. Throws an Error for invalid actions; the caller discards the result.
export function reduce(game: GameDoc, action: unknown, playerId: string): GameDoc {
  const act = parseAction(action);

  if (act.type === "start") return start(game, playerId);

  if (game.status !== "started" || !game.state) {
    throw new Error("The game hasn't started");
  }
  const s = clone(game.state as PowerGridState);

  switch (act.type) {
    case "nominate":
      requirePhase(s, "auction");
      requireCurrent(s, playerId);
      if (s.auction) throw new Error("An auction is already running");
      nominate(s, playerId, act.plant);
      break;
    case "pass":
      requirePhase(s, "auction");
      requireCurrent(s, playerId);
      if (s.auction) throw new Error("Finish the auction first");
      s.done.push(playerId);
      log(s, playerId, "passed");
      endTurn(s);
      break;
    case "bid":
      requireBidder(s, playerId);
      bid(s, playerId, act.amount);
      break;
    case "fold":
      requireBidder(s, playerId);
      fold(s, playerId);
      break;
    case "buyResource":
      requirePhase(s, "resources");
      requireCurrent(s, playerId);
      buyResource(s, playerId, act.plant, act.units);
      break;
    case "doneResources":
      requirePhase(s, "resources");
      requireCurrent(s, playerId);
      s.done.push(playerId);
      endTurn(s);
      break;
    case "buildCity":
      requirePhase(s, "build");
      requireCurrent(s, playerId);
      buildCity(s, playerId, act.city);
      break;
    case "doneBuild":
      requirePhase(s, "build");
      requireCurrent(s, playerId);
      s.done.push(playerId);
      endTurn(s);
      break;
    case "power":
      requirePhase(s, "bureaucracy");
      requireCurrent(s, playerId);
      power(s, playerId, act.plants);
      s.done.push(playerId);
      endTurn(s);
      break;
  }

  return { ...game, status: s.results ? "finished" : "started", state: s };
}

export function parseAction(action: unknown): PowerGridAction {
  if (!action || typeof action !== "object") throw new Error("Invalid action");
  const a = action as Record<string, unknown>;
  switch (a.type) {
    case "start":
    case "pass":
    case "fold":
    case "doneResources":
    case "doneBuild":
      return { type: a.type };
    case "nominate":
      return { type: "nominate", plant: wholeNumber(a, "plant") };
    case "bid":
      return { type: "bid", amount: wholeNumber(a, "amount") };
    case "buyResource":
      return {
        type: "buyResource",
        plant: wholeNumber(a, "plant"),
        units: wholeNumber(a, "units"),
      };
    case "buildCity":
      if (typeof a.city !== "string") throw new Error("Choose a city");
      return { type: "buildCity", city: a.city };
    case "power":
      if (!Array.isArray(a.plants) || !a.plants.every((n) => Number.isInteger(n))) {
        throw new Error("Choose plants to run");
      }
      return { type: "power", plants: a.plants as number[] };
    default:
      throw new Error("Unknown action");
  }
}

function wholeNumber(a: Record<string, unknown>, key: string): number {
  const v = a[key];
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`${key} must be a whole number`);
  return v;
}

// ---- Setup ----

function start(game: GameDoc, playerId: string): GameDoc {
  if (game.status !== "waiting") throw new Error("The game has already started");
  if (playerId !== game.createdBy) throw new Error("Only the host can start the game");
  if (game.players.length < MIN_PLAYERS) {
    throw new Error(`Need at least ${MIN_PLAYERS} players to start`);
  }
  if (game.players.length > MAX_PLAYERS) {
    throw new Error(`At most ${MAX_PLAYERS} players can play`);
  }

  const ids = game.players.map((p: GamePlayer) => p.id);
  const names: Record<string, string> = {};
  const money: Record<string, number> = {};
  const plants: Record<string, OwnedPlant[]> = {};
  for (const p of game.players) {
    names[p.id] = p.name;
    money[p.id] = START_MONEY;
    plants[p.id] = [];
  }

  const pool = shuffle(PLANT_NUMBERS);
  const removed = REMOVED_PLANTS[ids.length] ?? 0;
  const resources = { ...START_STOCK };

  const s: PowerGridState = {
    round: 1,
    phase: "auction",
    step: 1,
    order: shuffle(ids),
    current: null,
    names,
    money,
    houses: {},
    plants,
    market: { current: [], future: [] },
    deck: pool.slice(removed),
    resources,
    done: [],
    boughtThisRound: [],
    auction: null,
    results: null,
    log: [],
  };
  s.current = s.order[0];
  // Two passes: the first fills the future row, the second moves it to the current row and refills.
  refillMarket(s);
  refillMarket(s);
  log(s, null, `Round 1 begins. ${nameOf(s, s.current)} goes first.`);

  return { ...game, status: "started", state: s };
}

// ---- Auction ----

function nominate(s: PowerGridState, pid: string, plant: number): void {
  // Only the actual market (the lowest four plants) can be auctioned.
  if (!s.market.current.includes(plant)) {
    throw new Error(`Plant ${plant} isn't in the actual market`);
  }
  if ((s.plants[pid] ?? []).length >= MAX_PLANTS) {
    throw new Error(`You can own at most ${MAX_PLANTS} plants`);
  }
  if (s.money[pid] < plant) throw new Error(`You can't afford plant ${plant}`);

  // Players who already bought this round, or who own the maximum, can't bid.
  const active = s.order.filter(
    (p) => !s.boughtThisRound.includes(p) && (s.plants[p] ?? []).length < MAX_PLANTS,
  );
  const nominatorIdx = active.indexOf(pid);
  if (nominatorIdx < 0) throw new Error("You can't bid this round");

  s.auction = {
    plant,
    price: plant,
    leader: pid,
    active,
    turn: (nominatorIdx + 1) % active.length,
  };
  log(s, pid, `auctions plant ${plant} (opening bid ${plant})`);
  settleAuction(s);
}

function requireBidder(s: PowerGridState, pid: string): void {
  if (s.phase !== "auction" || !s.auction) throw new Error("There's no auction running");
  if (s.auction.active[s.auction.turn] !== pid) throw new Error("It's not your turn to bid");
}

function bid(s: PowerGridState, pid: string, amount: number): void {
  const a = s.auction!;
  if (amount <= a.price) throw new Error(`Bid more than ${a.price}`);
  if (amount > s.money[pid]) throw new Error("You don't have that much money");
  a.leader = pid;
  a.price = amount;
  a.turn = (a.turn + 1) % a.active.length;
  log(s, pid, `bids ${amount} on plant ${a.plant}`);
  settleAuction(s);
}

function fold(s: PowerGridState, pid: string): void {
  const a = s.auction!;
  if (pid === a.leader) throw new Error("You are the high bidder");
  a.active.splice(a.turn, 1);
  if (a.turn >= a.active.length) a.turn = 0;
  log(s, pid, `drops out of the auction for plant ${a.plant}`);
  settleAuction(s);
}

// Moves the auction past anyone who can't act, and ends it once one bidder is left.
function settleAuction(s: PowerGridState): void {
  const a = s.auction!;
  for (;;) {
    if (a.active.length === 1) return resolveAuction(s);
    const bidder = a.active[a.turn];
    if (bidder === a.leader) {
      a.turn = (a.turn + 1) % a.active.length;
      continue;
    }
    if (s.money[bidder] <= a.price) {
      a.active.splice(a.turn, 1);
      if (a.turn >= a.active.length) a.turn = 0;
      log(s, bidder, `can't outbid ${a.price} and drops out`);
      continue;
    }
    return;
  }
}

function resolveAuction(s: PowerGridState): void {
  const a = s.auction!;
  const winner = a.leader;
  s.money[winner] -= a.price;
  s.plants[winner] = [...s.plants[winner], { number: a.plant, stored: 0 }].sort(
    (x, y) => x.number - y.number,
  );
  s.boughtThisRound.push(winner);
  if (!s.done.includes(winner)) s.done.push(winner);
  log(s, winner, `buys plant ${a.plant} for ${a.price}`);
  s.auction = null;
  removeFromMarket(s, a.plant);
  // The nominator's turn is over, so the next player goes.
  endTurn(s);
}

// ---- Resources ----

function buyResource(s: PowerGridState, pid: string, plantNumber: number, units: number): void {
  const owned = (s.plants[pid] ?? []).find((p) => p.number === plantNumber);
  if (!owned) throw new Error(`You don't own plant ${plantNumber}`);
  const data = plantData(plantNumber);
  if (data.kind === "eco") throw new Error(`Plant ${plantNumber} doesn't use fuel`);
  if (units < 1) throw new Error("Buy at least one unit");
  const res = data.kind as Resource;
  const cap = plantCapacity(data);
  if (owned.stored + units > cap) {
    throw new Error(`Plant ${plantNumber} holds ${cap} units and has ${cap - owned.stored} free`);
  }
  if (units > s.resources[res]) {
    throw new Error(`Only ${s.resources[res]} ${res} left in the market`);
  }
  const cost = resourceCost(s, res, units);
  if (cost > s.money[pid]) throw new Error(`${units} ${res} costs ${cost}; you have ${s.money[pid]}`);

  s.money[pid] -= cost;
  s.resources[res] -= units;
  owned.stored += units;
  log(s, pid, `buys ${units} ${res} for ${cost}`);
}

// Price of the next unit when `stock` units are left in the market.
export function unitPrice(res: Resource, stock: number): number {
  const [min, max] = PRICE[res];
  const cap = CAP[res];
  return min + Math.round(((max - min) * (cap - stock)) / (cap - 1));
}

// Cost of buying `units` units, taking the cheapest first (the price rises as stock runs out).
export function resourceCost(s: PowerGridState, res: Resource, units: number): number {
  let total = 0;
  let stock = s.resources[res];
  for (let k = 0; k < units; k++) {
    total += unitPrice(res, stock);
    stock--;
  }
  return total;
}

// ---- Cities ----

export function ownedCities(s: PowerGridState, pid: string): string[] {
  return CITIES.map((c) => c.id).filter((id) => (s.houses[id] ?? []).includes(pid));
}

// Cheapest link cost from any of `sources` to every city (Dijkstra over the map).
export function distancesFrom(sources: string[]): Record<string, number> {
  const dist: Record<string, number> = {};
  const visited: Record<string, boolean> = {};
  for (const c of CITIES) dist[c.id] = Infinity;
  for (const src of sources) dist[src] = 0;

  for (let i = 0; i < CITIES.length; i++) {
    let best: string | null = null;
    for (const c of CITIES) {
      if (visited[c.id]) continue;
      if (best === null || dist[c.id] < dist[best]) best = c.id;
    }
    if (best === null || dist[best] === Infinity) break;
    visited[best] = true;
    for (const e of EDGES) {
      const other = e.from === best ? e.to : e.to === best ? e.from : null;
      if (other !== null && dist[best] + e.cost < dist[other]) {
        dist[other] = dist[best] + e.cost;
      }
    }
  }
  return dist;
}

// Cost of linking a city to the player's network. Zero for a player's first city.
export function connectionCost(s: PowerGridState, pid: string, cityId: string): number {
  const owned = ownedCities(s, pid);
  if (owned.length === 0) return 0;
  return distancesFrom(owned)[cityId];
}

// Full cost of a house in `cityId`, or Infinity if the city is full.
export function buildCost(s: PowerGridState, pid: string, cityId: string): number {
  const slot = SLOT_COST[(s.houses[cityId] ?? []).length];
  if (slot === undefined) return Infinity;
  return slot + connectionCost(s, pid, cityId);
}

export const LIMITS = { MAX_CITIES, MAX_PLANTS };

// Houses allowed in one city: one in step 1, two in step 2, three in step 3 (sourced).
export function housesAllowed(step: 1 | 2 | 3): number {
  return step;
}

// Income for powering `cities` cities.
export function payout(cities: number): number {
  return PAYOUT[Math.min(cities, PAYOUT.length - 1)];
}

// ---- Building ----

function buildCity(s: PowerGridState, pid: string, cityId: string): void {
  if (!CITIES.some((c) => c.id === cityId)) throw new Error("Unknown city");
  const houses = s.houses[cityId] ?? [];
  if (houses.includes(pid)) throw new Error(`You already have a house in ${cityName(cityId)}`);
  if (houses.length >= housesAllowed(s.step)) throw new Error(`${cityName(cityId)} is full`);
  if (ownedCities(s, pid).length >= MAX_CITIES) throw new Error(`You can have at most ${MAX_CITIES} cities`);
  const cost = buildCost(s, pid, cityId);
  if (s.money[pid] < cost) throw new Error(`Building in ${cityName(cityId)} costs ${cost}`);

  s.money[pid] -= cost;
  s.houses[cityId] = [...houses, pid];
  log(s, pid, `builds in ${cityName(cityId)} for ${cost}`);
}

// ---- Bureaucracy ----

function power(s: PowerGridState, pid: string, plantNumbers: number[]): void {
  if (new Set(plantNumbers).size !== plantNumbers.length) throw new Error("Each plant can run once");
  const owned = s.plants[pid] ?? [];
  let cities = 0;
  const running: OwnedPlant[] = [];
  for (const n of plantNumbers) {
    const op = owned.find((p) => p.number === n);
    if (!op) throw new Error(`You don't own plant ${n}`);
    const data = plantData(n);
    if (op.stored < data.inputs) throw new Error(`Plant ${n} needs ${data.inputs} fuel to run`);
    running.push(op);
    cities += data.cities;
  }
  for (const op of running) op.stored -= plantData(op.number).inputs;

  const powered = Math.min(cities, ownedCities(s, pid).length);
  const income = PAYOUT[powered];
  s.money[pid] += income;
  log(s, pid, `powers ${powered} ${powered === 1 ? "city" : "cities"} and earns ${income}`);
}

// ---- Phases and rounds ----

function phaseOrder(s: PowerGridState): string[] {
  // Resources and building go in reverse turn order, so the player furthest behind goes first.
  return s.phase === "resources" || s.phase === "build" ? [...s.order].reverse() : s.order;
}

function requirePhase(s: PowerGridState, phase: Phase): void {
  if (s.phase !== phase) throw new Error(`That can only be done in the ${phase} phase`);
}

function requireCurrent(s: PowerGridState, pid: string): void {
  if (s.current !== pid) throw new Error("It's not your turn");
}

// Next player (in this phase's order) who isn't done yet, or null if everyone is.
function nextCurrent(s: PowerGridState): string | null {
  const list = phaseOrder(s);
  const i = s.current ? list.indexOf(s.current) : -1;
  for (let k = 1; k <= list.length; k++) {
    const p = list[(i + k) % list.length];
    if (!s.done.includes(p)) return p;
  }
  return null;
}

function endTurn(s: PowerGridState): void {
  const next = nextCurrent(s);
  if (next !== null) s.current = next;
  else advancePhase(s);
}

function advancePhase(s: PowerGridState): void {
  switch (s.phase) {
    case "auction":
      return startPhase(s, "resources");
    case "resources":
      return startPhase(s, "build");
    case "build":
      return startPhase(s, "bureaucracy");
    case "bureaucracy":
      return endRound(s);
  }
}

function startPhase(s: PowerGridState, phase: Phase): void {
  s.phase = phase;
  s.done = [];
  s.auction = null;
  s.current = phaseOrder(s)[0];
  log(s, null, `${phaseName(phase)} phase`);
}

function endRound(s: PowerGridState): void {
  for (const r of RESOURCES) {
    s.resources[r] = Math.min(CAP[r], s.resources[r] + REFILL[r][s.step - 1]);
  }

  const maxCities = Math.max(0, ...s.order.map((p) => ownedCities(s, p).length));
  s.step = maxCities >= STEP3_CITIES ? 3 : maxCities >= STEP2_CITIES ? 2 : 1;

  if (maxCities >= endCities(s.order.length)) {
    s.results = results(s);
    const top = s.results.winners.map((w) => nameOf(s, w)).join(" and ");
    log(s, null, `Game over. ${top} ${s.results.winners.length > 1 ? "tie" : "wins"}.`);
    return;
  }

  s.order = nextOrder(s);
  s.round += 1;
  s.boughtThisRound = [];
  startPhase(s, "auction");
  log(s, null, `Round ${s.round} begins. ${nameOf(s, s.current)} goes first.`);
}

// Most cities first, then highest-numbered plant, then the old order.
function nextOrder(s: PowerGridState): string[] {
  const cities = (p: string) => ownedCities(s, p).length;
  const top = (p: string) => Math.max(0, ...(s.plants[p] ?? []).map((x) => x.number));
  return [...s.order].sort((a, b) => {
    if (cities(a) !== cities(b)) return cities(b) - cities(a);
    if (top(a) !== top(b)) return top(b) - top(a);
    return s.order.indexOf(a) - s.order.indexOf(b);
  });
}

export function scores(s: PowerGridState): Score[] {
  return s.order.map((p) => {
    const cities = ownedCities(s, p);
    const plantCities = (s.plants[p] ?? []).reduce((sum, op) => sum + plantData(op.number).cities, 0);
    return {
      id: p,
      cities: cities.length,
      capacity: Math.min(plantCities, cities.length),
      money: s.money[p],
    };
  });
}

function results(s: PowerGridState): Results {
  const sorted = scores(s).sort((a, b) => b.capacity - a.capacity || b.money - a.money);
  const top = sorted[0];
  const winners = sorted
    .filter((x) => x.capacity === top.capacity && x.money === top.money)
    .map((x) => x.id);
  return { scores: sorted, winners };
}

// ---- Market ----

function removeFromMarket(s: PowerGridState, plant: number): void {
  s.market.current = s.market.current.filter((n) => n !== plant);
  s.market.future = s.market.future.filter((n) => n !== plant);
  refillMarket(s);
}

// Keeps two rows of four plants. The current row takes the lowest future plant, and the future row draws from the deck.
function refillMarket(s: PowerGridState): void {
  while (s.market.current.length < MARKET_ROW && s.market.future.length > 0) {
    s.market.current.push(s.market.future.shift()!);
  }
  while (s.market.future.length < MARKET_ROW && s.deck.length > 0) {
    s.market.future.push(s.deck.shift()!);
  }
  s.market.current.sort((a, b) => a - b);
  s.market.future.sort((a, b) => a - b);
}

// ---- Helpers ----

function phaseName(phase: Phase): string {
  switch (phase) {
    case "auction":
      return "Auction";
    case "resources":
      return "Resources";
    case "build":
      return "Building";
    case "bureaucracy":
      return "Bureaucracy";
  }
}

function nameOf(s: PowerGridState, pid: string | null): string {
  return pid === null ? "Nobody" : s.names[pid] ?? pid;
}

const LOG_TEXT_MAX = 200;

function log(s: PowerGridState, by: string | null, text: string): void {
  const line = by === null ? text : `${nameOf(s, by)} ${text}`;
  s.log.push({ by, text: line.slice(0, LOG_TEXT_MAX) });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Fisher-Yates shuffle. Uses Math.random, like the other games, so the result comes from the server transaction.
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
