import { GameDoc } from "../../types";
import { CITIES, ROUTES, RouteData } from "./map/europe";
import { LONG_TICKET_IDS, REGULAR_TICKET_IDS } from "./map/tickets";
import { buildTrainDeck, shuffle } from "./deck";
import { scoreGame } from "./scoring";
import { CARD_COLORS, CardColor, TTRAction, TTRState } from "./types";

export const TRAINS_PER_PLAYER = 45;
export const STATIONS_PER_PLAYER = 3;
const START_HAND = 4;
const FACE_UP_COUNT = 5;
const SETUP_TICKETS_DEALT = 3; // plus one long route ticket
const SETUP_TICKETS_MIN = 2;
const DRAW_TICKETS_DEALT = 3;
const DRAW_TICKETS_MIN = 1;
const TUNNEL_REVEAL = 3;
const LOG_LIMIT = 30;
// Once a player has this many trains or fewer at the end of their turn, the last round begins.
const LAST_ROUND_TRAINS = 2;
// Face-up resets (3+ locomotives) allowed in one refill before the row is left as it is.
const MAX_FACE_UP_RESETS = 20;

// Applies one action. Throws an Error for invalid actions; the caller discards the result.
export function reduce(game: GameDoc, action: unknown, playerId: string): GameDoc {
  const act = parseAction(action);

  if (act.type === "start") return start(game, playerId);

  if (game.status !== "started" || !game.state) {
    throw new Error("The game hasn't started");
  }
  const s = clone(game.state as TTRState);

  switch (act.type) {
    case "keepTickets":
      keepTickets(s, playerId, act.ids);
      break;
    case "drawFaceUp":
      requireTurn(s, playerId);
      drawFaceUp(s, playerId, act.slot);
      break;
    case "drawDeck":
      requireTurn(s, playerId);
      drawFromDeck(s, playerId);
      break;
    case "drawTickets":
      requireTurn(s, playerId);
      drawTickets(s, playerId);
      break;
    case "claimRoute":
      requireTurn(s, playerId);
      claimRoute(s, playerId, act.routeId, act.payment);
      break;
    case "payTunnel":
      payTunnel(s, playerId, act.payment);
      break;
    case "declineTunnel":
      declineTunnel(s, playerId);
      break;
    case "placeStation":
      requireTurn(s, playerId);
      placeStation(s, playerId, act.city, act.payment);
      break;
    case "pass":
      requireTurn(s, playerId);
      if (!canPass(s, playerId)) throw new Error("You can only pass when you have no other move");
      addLog(s, playerId, "passed (no legal move)");
      endTurn(s);
      break;
  }

  return {
    ...game,
    status: s.phase === "finished" ? "finished" : "started",
    state: s,
  };
}

// Checks the shape of an incoming action and returns it typed. Throws a clear error otherwise.
export function parseAction(action: unknown): TTRAction {
  if (typeof action !== "object" || action === null) throw new Error("Malformed action");
  const a = action as Record<string, unknown>;
  const cards = (field: string): CardColor[] => {
    const v = a[field];
    if (!Array.isArray(v) || !v.every((c) => CARD_COLORS.includes(c as CardColor))) {
      throw new Error(`Action "${String(a.type)}" needs "${field}" as a list of card colors`);
    }
    return v as CardColor[];
  };
  const str = (field: string): string => {
    if (typeof a[field] !== "string") {
      throw new Error(`Action "${String(a.type)}" needs "${field}" as a string`);
    }
    return a[field] as string;
  };

  switch (a.type) {
    case "start":
    case "drawDeck":
    case "drawTickets":
    case "declineTunnel":
    case "pass":
      return { type: a.type };
    case "keepTickets": {
      const ids = a.ids;
      if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) {
        throw new Error('Action "keepTickets" needs "ids" as a list of ticket ids');
      }
      return { type: "keepTickets", ids: ids as number[] };
    }
    case "drawFaceUp":
      if (!Number.isInteger(a.slot)) throw new Error('Action "drawFaceUp" needs a numeric "slot"');
      return { type: "drawFaceUp", slot: a.slot as number };
    case "claimRoute":
      return { type: "claimRoute", routeId: str("routeId"), payment: cards("payment") };
    case "payTunnel":
      return { type: "payTunnel", payment: cards("payment") };
    case "placeStation":
      return { type: "placeStation", city: str("city"), payment: cards("payment") };
    default:
      throw new Error(`Unknown action type: ${String(a.type)}`);
  }
}

function start(game: GameDoc, playerId: string): GameDoc {
  if (game.status !== "waiting") throw new Error("The game has already started");
  if (playerId !== game.createdBy) throw new Error("Only the host can start the game");
  if (game.players.length < 2) throw new Error("Need at least 2 players to start");

  const s: TTRState = {
    phase: "setup",
    order: game.players.map((p) => p.id),
    current: 0,
    deck: buildTrainDeck(),
    discard: [],
    faceUp: [],
    hands: {},
    trains: {},
    owners: {},
    stations: {},
    ticketDeck: shuffle(REGULAR_TICKET_IDS),
    longDeck: shuffle(LONG_TICKET_IDS),
    box: [],
    tickets: {},
    offers: {},
    drawnThisTurn: 0,
    lastRoundBy: null,
    pendingTunnel: null,
    results: null,
    log: [],
  };

  for (const pid of s.order) {
    s.hands[pid] = [];
    for (let i = 0; i < START_HAND; i++) s.hands[pid].push(drawCard(s) as CardColor);
    s.trains[pid] = TRAINS_PER_PLAYER;
    s.tickets[pid] = [];
    // Setup offer: one long route ticket plus 3 regular tickets; keep at least 2 in total.
    const long = s.longDeck.splice(0, 1);
    s.offers[pid] = {
      ids: [...long, ...takeTickets(s, SETUP_TICKETS_DEALT)],
      min: SETUP_TICKETS_MIN,
    };
  }
  // Long route tickets that weren't dealt go back in the box.
  s.box = [...s.longDeck];
  s.longDeck = [];
  refillFaceUp(s);
  addLog(s, null, "Game started. Keep your destination tickets.");

  return { ...game, status: "started", state: s };
}

function requireTurn(s: TTRState, playerId: string) {
  if (s.phase !== "playing") throw new Error("Choose your starting tickets first");
  if (s.order[s.current] !== playerId) throw new Error("It's not your turn");
  if (s.offers[playerId]) throw new Error("Keep your offered tickets first");
  if (s.pendingTunnel) throw new Error("Pay for the tunnel or give it up first");
}

function keepTickets(s: TTRState, playerId: string, ids: number[]) {
  const offer = s.offers[playerId];
  if (!offer) throw new Error("No tickets are offered to you");
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate tickets selected");
  if (!ids.every((id) => offer.ids.includes(id))) throw new Error("Invalid ticket selection");
  if (ids.length < offer.min) {
    throw new Error(`You must keep at least ${offer.min} ticket(s)`);
  }

  s.tickets[playerId].push(...ids);
  const returned = offer.ids.filter((id) => !ids.includes(id));
  if (s.phase === "setup") {
    // Tickets discarded at setup (long or regular) go back in the box.
    s.box = [...(s.box ?? []), ...returned];
  } else {
    // Tickets discarded mid-game go to the bottom of the ticket deck (index 0 is the top).
    s.ticketDeck.push(...returned);
  }
  delete s.offers[playerId];

  addLog(s, playerId, `kept ${ids.length} ticket(s)`);

  if (s.phase === "setup") {
    if (Object.keys(s.offers).length === 0) {
      s.phase = "playing";
      s.current = 0;
      addLog(s, null, "Setup complete. The first player in the list starts.");
    }
  } else {
    endTurn(s);
  }
}

function drawFaceUp(s: TTRState, playerId: string, slot: number) {
  if (s.drawnThisTurn >= 2) throw new Error("You've already drawn 2 cards");
  const card = s.faceUp[slot];
  if (card === undefined) throw new Error("No card in that slot");
  if (card === "loco" && s.drawnThisTurn === 1) {
    throw new Error("You can't take a locomotive as a second card");
  }

  s.faceUp.splice(slot, 1);
  s.hands[playerId].push(card);
  refillFaceUp(s);
  addLog(s, playerId, `drew a ${card} card from the face-up row`);

  s.drawnThisTurn++;
  // A face-up locomotive is the only card drawn this turn.
  if (card === "loco" || s.drawnThisTurn === 2 || !canDrawSecondCard(s)) endTurn(s);
}

function drawFromDeck(s: TTRState, playerId: string) {
  if (s.drawnThisTurn >= 2) throw new Error("You've already drawn 2 cards");
  const card = drawCard(s);
  if (!card) throw new Error("No cards left");

  s.hands[playerId].push(card);
  addLog(s, playerId, "drew a card from the deck");

  s.drawnThisTurn++;
  // A blind locomotive counts as a normal card.
  if (s.drawnThisTurn === 2 || !canDrawSecondCard(s)) endTurn(s);
}

// Whether a second card can be drawn: from the deck (or reshuffled discards), or a
// non-locomotive face-up card. If not, the turn ends after the first card.
function canDrawSecondCard(s: TTRState): boolean {
  return s.deck.length + s.discard.length > 0 || s.faceUp.some((c) => c !== "loco");
}

function drawTickets(s: TTRState, playerId: string) {
  if (s.drawnThisTurn > 0) throw new Error("Draw tickets as your first action");
  const ids = takeTickets(s, DRAW_TICKETS_DEALT);
  if (ids.length === 0) throw new Error("No tickets left");

  s.offers[playerId] = { ids, min: DRAW_TICKETS_MIN };
  addLog(s, playerId, "drew destination tickets");
}

// Why a player can't claim a route right now, or null if the route is claimable
// (ignoring the cards in hand, which are checked when paying).
export function routeBlockReason(s: TTRState, playerId: string, route: RouteData): string | null {
  if (s.owners[route.id]) return "Already claimed";
  // Parallel routes: a player can't claim both, and in 2–3 player games only one of the pair is used.
  const siblings = ROUTES.filter((r) => r.group === route.group && r.id !== route.id);
  if (siblings.some((r) => s.owners[r.id] === playerId)) {
    return "You already own the other route between these cities";
  }
  if (s.order.length <= 3 && siblings.some((r) => s.owners[r.id])) {
    return "The other route between these cities is taken (2–3 players)";
  }
  if (s.trains[playerId] < route.length) return "Not enough trains";
  return null;
}

function claimRoute(s: TTRState, playerId: string, routeId: string, payment: CardColor[]) {
  if (s.drawnThisTurn > 0) throw new Error("You can't claim a route after drawing cards");
  const route = ROUTES.find((r) => r.id === routeId);
  if (!route) throw new Error("Unknown route");
  const blocked = routeBlockReason(s, playerId, route);
  if (blocked) throw new Error(blocked);

  if (payment.length !== route.length) {
    throw new Error(`This route costs exactly ${route.length} cards`);
  }

  const locos = payment.filter((c) => c === "loco").length;
  if (locos < route.locos) {
    throw new Error(`This ferry needs ${route.locos} locomotive(s)`);
  }
  const nonLoco = payment.filter((c) => c !== "loco");
  if (route.color !== "gray" && nonLoco.some((c) => c !== route.color)) {
    throw new Error(`Payment must be ${route.color} (or locomotives)`);
  }
  if (route.color === "gray" && new Set(nonLoco).size > 1) {
    throw new Error("Gray routes need cards of a single color (or locomotives)");
  }
  // The color the cards were played in. Paid only with locomotives: "loco".
  const payColor: CardColor = nonLoco[0] ?? "loco";

  // Removes the payment from the hand (validates that the player owns those cards).
  takeFromHand(s, playerId, payment);

  if (!route.tunnel) {
    s.discard.push(...payment);
    completeClaim(s, playerId, route);
    endTurn(s);
    return;
  }

  // Tunnel: the payment is held aside while 3 cards are revealed from the deck. Each
  // revealed card matching the played color, or any locomotive, costs one more card.
  // When paid only with locomotives, only revealed locomotives count (and need locomotives).
  // With fewer cards left, only those are revealed; with none, the tunnel costs nothing extra.
  const revealed: CardColor[] = [];
  for (let i = 0; i < TUNNEL_REVEAL; i++) {
    const card = drawCard(s);
    if (card) revealed.push(card);
  }
  const extra = revealed.filter((c) => matchesTunnel(c, payColor)).length;
  addLog(
    s,
    null,
    `Tunnel at ${route.from}–${route.to}: revealed ${revealed.join(", ") || "nothing"}` +
      (extra > 0 ? `; ${extra} extra card(s) needed` : "; no extra cards needed"),
  );

  if (extra === 0) {
    s.discard.push(...payment, ...revealed);
    completeClaim(s, playerId, route);
    endTurn(s);
    return;
  }

  const matching = s.hands[playerId].filter((c) => matchesTunnel(c, payColor)).length;
  if (matching < extra) {
    // Can't pay: the cards go back to the hand, the revealed cards are discarded,
    // and the turn ends.
    s.hands[playerId].push(...payment);
    s.discard.push(...revealed);
    addLog(s, playerId, "couldn't pay for the tunnel and took the cards back");
    endTurn(s);
    return;
  }

  // The player decides: payTunnel or declineTunnel.
  s.pendingTunnel = { playerId, routeId, payment, revealed, payColor, extra };
}

// A card matches a tunnel paid in `payColor` if it is that color or a locomotive.
// Paid with locomotives only (payColor "loco"), just locomotives match.
function matchesTunnel(card: CardColor, payColor: CardColor): boolean {
  return card === "loco" || card === payColor;
}

function payTunnel(s: TTRState, playerId: string, payment: CardColor[]) {
  const t = s.pendingTunnel;
  if (!t || t.playerId !== playerId) throw new Error("You have no tunnel to pay for");
  if (payment.length !== t.extra) throw new Error(`The tunnel needs exactly ${t.extra} more card(s)`);
  if (!payment.every((c) => matchesTunnel(c, t.payColor))) {
    throw new Error(
      t.payColor === "loco"
        ? "The extra cards must be locomotives"
        : `The extra cards must be ${t.payColor} (or locomotives)`,
    );
  }
  takeFromHand(s, playerId, payment);
  const route = ROUTES.find((r) => r.id === t.routeId) as RouteData;
  s.discard.push(...t.payment, ...payment, ...t.revealed);
  s.pendingTunnel = null;
  addLog(s, playerId, `paid ${t.extra} extra card(s) for the tunnel`);
  completeClaim(s, playerId, route);
  endTurn(s);
}

function declineTunnel(s: TTRState, playerId: string) {
  const t = s.pendingTunnel;
  if (!t || t.playerId !== playerId) throw new Error("You have no tunnel to give up");
  s.hands[playerId].push(...t.payment);
  s.discard.push(...t.revealed);
  s.pendingTunnel = null;
  addLog(s, playerId, "gave up on the tunnel and took the cards back");
  endTurn(s);
}

function completeClaim(s: TTRState, playerId: string, route: RouteData) {
  s.owners[route.id] = playerId;
  s.trains[playerId] -= route.length;
  addLog(s, playerId, `claimed ${route.from}–${route.to} (${route.length})`);
}

// A station costs 1, 2, then 3 cards for a player's first, second, and third station.
// All paid cards must share a color (locomotives are wild). Placing one uses the turn.
// A station can go in any city without one, even a city with no claimed routes.
function placeStation(s: TTRState, playerId: string, city: string, payment: CardColor[]) {
  if (s.drawnThisTurn > 0) throw new Error("You can't build a station after drawing cards");
  if (!CITIES.some((c) => c.id === city)) throw new Error("Unknown city");
  if (s.stations[city]) throw new Error("There's already a station in that city");

  const owned = stationsBuilt(s, playerId);
  if (owned >= STATIONS_PER_PLAYER) throw new Error("You have no stations left");

  const cost = owned + 1;
  if (payment.length !== cost) throw new Error(`Your next station costs ${cost} card(s)`);
  if (new Set(payment.filter((c) => c !== "loco")).size > 1) {
    throw new Error("Station payment must be one color (or locomotives)");
  }

  takeFromHand(s, playerId, payment);
  s.discard.push(...payment);
  s.stations[city] = playerId;
  addLog(s, playerId, `built a station in ${city}`);
  endTurn(s);
}

export function stationsBuilt(s: TTRState, playerId: string): number {
  return Object.values(s.stations).filter((o) => o === playerId).length;
}

// Whether `hand` can pay `length` cards of one color (any single color if `color` is
// "gray"), including at least `locosNeeded` locomotives.
function canAfford(hand: CardColor[], length: number, color: string, locosNeeded: number): boolean {
  const locos = hand.filter((c) => c === "loco").length;
  if (locos < locosNeeded) return false;
  const counts: Record<string, number> = {};
  for (const c of hand) if (c !== "loco") counts[c] = (counts[c] ?? 0) + 1;
  const best = color === "gray" ? Math.max(0, ...Object.values(counts)) : counts[color] ?? 0;
  return best + locos >= length;
}

// True when the player, at the start of their turn, has no legal action: no train card
// can be drawn, no tickets are left, and no route or station is affordable. The official
// rules don't cover this (it needs every card hoarded in hands); passing avoids a deadlock.
export function canPass(s: TTRState, playerId: string): boolean {
  if (s.phase !== "playing" || s.order[s.current] !== playerId) return false;
  if (s.offers[playerId] || s.pendingTunnel || s.drawnThisTurn > 0) return false;
  if (s.deck.length + s.discard.length + s.faceUp.length > 0) return false;
  if (s.ticketDeck.length > 0) return false;
  const hand = s.hands[playerId];
  const built = stationsBuilt(s, playerId);
  if (
    built < STATIONS_PER_PLAYER &&
    CITIES.some((c) => !s.stations[c.id]) &&
    canAfford(hand, built + 1, "gray", 0)
  ) {
    return false;
  }
  return !ROUTES.some(
    (r) => routeBlockReason(s, playerId, r) === null && canAfford(hand, r.length, r.color, r.locos),
  );
}

function takeFromHand(s: TTRState, playerId: string, cards: CardColor[]) {
  const hand = s.hands[playerId];
  for (const card of cards) {
    const i = hand.indexOf(card);
    if (i === -1) throw new Error("You don't have those cards");
    hand.splice(i, 1);
  }
}

// Ends the current player's turn. The last round starts when the player ending their turn
// has 2 or fewer trains; then every player, including that one, gets one final turn.
function endTurn(s: TTRState) {
  s.drawnThisTurn = 0;
  const n = s.order.length;
  const pid = s.order[s.current];

  if (s.lastRoundBy === null) {
    if (s.trains[pid] <= LAST_ROUND_TRAINS) {
      s.lastRoundBy = pid;
      s.finalTurnsLeft = n;
      addLog(s, null, "Last round! Everyone, including this player, gets one more turn.");
    }
  } else {
    if (s.finalTurnsLeft === undefined) {
      // State saved before finalTurnsLeft existed: finish after the trigger player's turn.
      const trigger = s.order.indexOf(s.lastRoundBy);
      s.finalTurnsLeft = ((trigger - s.current + n) % n) + 1;
    }
    s.finalTurnsLeft--;
    if (s.finalTurnsLeft <= 0) {
      s.finalTurnsLeft = 0;
      s.phase = "finished";
      s.results = scoreGame(s);
      addLog(s, null, "Game over");
      return;
    }
  }

  s.current = (s.current + 1) % n;
}

// Draws the top card of the deck, reshuffling the discard pile if needed.
function drawCard(s: TTRState): CardColor | null {
  if (s.deck.length === 0) {
    if (s.discard.length === 0) return null;
    s.deck = shuffle(s.discard);
    s.discard = [];
  }
  return s.deck.pop() ?? null;
}

// Keeps five face-up cards. Three or more locomotives showing: discard all five and refill.
// If the remaining cards can't make a row with fewer than 3 locomotives (or after many
// resets), the row is left as it is, so this always terminates.
function refillFaceUp(s: TTRState) {
  for (let resets = 0; ; resets++) {
    while (s.faceUp.length < FACE_UP_COUNT) {
      const card = drawCard(s);
      if (!card) break;
      s.faceUp.push(card);
    }
    if (s.faceUp.filter((c) => c === "loco").length < 3) return;
    const pool = [...s.faceUp, ...s.deck, ...s.discard];
    const nonLoco = pool.filter((c) => c !== "loco").length;
    const rowSize = Math.min(FACE_UP_COUNT, pool.length);
    if (nonLoco < rowSize - 2 || resets >= MAX_FACE_UP_RESETS) return;
    s.discard.push(...s.faceUp);
    s.faceUp = [];
  }
}

function takeTickets(s: TTRState, n: number): number[] {
  return s.ticketDeck.splice(0, n);
}

function addLog(s: TTRState, by: string | null, text: string) {
  s.log.push({ by, text });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
