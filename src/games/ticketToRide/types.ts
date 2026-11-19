export type TrainColor =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "white"
  | "black";

export const TRAIN_COLORS: TrainColor[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "pink",
  "white",
  "black",
];

// "loco" is the wild card.
export type CardColor = TrainColor | "loco";

export const CARD_COLORS: CardColor[] = [...TRAIN_COLORS, "loco"];

// "gray" routes can be claimed with any single color.
export type RouteColor = TrainColor | "gray";

export interface Ticket {
  id: number;
  from: string;
  to: string;
  points: number;
  long: boolean; // long route tickets are only dealt at setup
}

// Tickets a player has been offered and must keep at least `min` of.
export interface TicketOffer {
  ids: number[];
  min: number;
}

export interface LogEntry {
  by: string | null; // player id, or null for system messages
  text: string;
}

export interface PlayerScore {
  routePoints: number;
  ticketPoints: number; // completed tickets added, failed tickets subtracted
  ticketsCompleted: number;
  ticketsFailed: number;
  stationsBuilt: number;
  stationPoints: number; // 4 points per station still in reserve
  // Opponent routes this player's stations borrowed to complete tickets (route ids).
  borrowedRoutes: string[];
  longestRoute: number; // length of the longest continuous path (stations don't count)
  longestBonus: boolean; // European Express bonus (10 points)
  total: number;
  // Winner after tie-breaks: most points, then most completed tickets, then fewest
  // stations built, then the European Express bonus. Several players can still tie.
  winner: boolean;
}

// A tunnel claim waiting for the player to pay the extra cards or give up.
export interface PendingTunnel {
  playerId: string;
  routeId: string;
  payment: CardColor[]; // cards laid down, held aside until the tunnel resolves
  revealed: CardColor[]; // cards turned over from the deck, discarded when it resolves
  payColor: CardColor; // color the extra cards must match ("loco" if paid only with locomotives)
  extra: number; // number of extra cards required
}

// Everything stored in GameDoc.state for a Ticket to Ride game.
export interface TTRState {
  phase: "setup" | "playing" | "finished";
  order: string[]; // player ids in turn order
  current: number; // index into `order`
  deck: CardColor[];
  discard: CardColor[];
  faceUp: CardColor[];
  hands: Record<string, CardColor[]>;
  trains: Record<string, number>;
  owners: Record<string, string>; // route id -> player id
  stations: Record<string, string>; // city id -> player id
  ticketDeck: number[]; // regular destination tickets; index 0 is the top
  longDeck: number[]; // long route tickets, dealt at setup only (empty afterwards)
  // Tickets removed from the game: undealt long tickets and tickets discarded at setup.
  // Optional so states saved before this field existed still load.
  box?: number[];
  tickets: Record<string, number[]>; // player id -> kept ticket ids
  offers: Record<string, TicketOffer>;
  drawnThisTurn: number;
  lastRoundBy: string | null;
  // Turns left in the final round, counting the turn in progress. Set when the last
  // round starts; the game ends when it reaches 0.
  finalTurnsLeft?: number;
  pendingTunnel?: PendingTunnel | null;
  results: Record<string, PlayerScore> | null;
  log: LogEntry[];
}

export type TTRAction =
  | { type: "start" }
  | { type: "keepTickets"; ids: number[] }
  | { type: "drawFaceUp"; slot: number }
  | { type: "drawDeck" }
  | { type: "drawTickets" }
  | { type: "claimRoute"; routeId: string; payment: CardColor[] }
  // Tunnel follow-ups while state.pendingTunnel is set.
  | { type: "payTunnel"; payment: CardColor[] }
  | { type: "declineTunnel" }
  | { type: "placeStation"; city: string; payment: CardColor[] }
  // Only allowed when the player has no other legal action (see canPass).
  | { type: "pass" };
