export type Resource = "coal" | "oil" | "garbage" | "uranium";
export const RESOURCES: Resource[] = ["coal", "oil", "garbage", "uranium"];

// "eco" plants (wind, solar and similar) need no fuel.
export type PlantKind = Resource | "eco";

export interface PlantData {
  number: number;
  kind: PlantKind;
  // Fuel units needed to run the plant for one round. 0 for eco plants.
  inputs: number;
  // Cities the plant can power when it runs.
  cities: number;
}

export interface OwnedPlant {
  number: number;
  // Fuel currently stored in this plant.
  stored: number;
}

export type Phase = "auction" | "resources" | "build" | "bureaucracy";

export interface Auction {
  plant: number;
  price: number;
  leader: string; // player id of the current high bidder
  active: string[]; // players still bidding, in turn order
  turn: number; // index into `active` of the player whose bid or fold is due
}

export interface Score {
  id: string;
  cities: number;
  capacity: number; // most cities the player's plants could power
  money: number;
}

export interface Results {
  scores: Score[];
  winners: string[];
}

export interface LogEntry {
  by: string | null; // player id, or null for system messages
  text: string;
}

export interface PowerGridState {
  round: number;
  phase: Phase;
  // Market step: 1 early, 2 and 3 later. Later steps refill fuel more slowly.
  step: 1 | 2 | 3;
  // Turn order for this round. The first player is the one who acts first in the auction.
  order: string[];
  // Player whose turn it is in the current phase.
  current: string | null;
  // Player id -> display name, used in the log.
  names: Record<string, string>;
  money: Record<string, number>;
  // City id -> ids of the players with a house there (one house per player per city).
  houses: Record<string, string[]>;
  plants: Record<string, OwnedPlant[]>;
  market: { current: number[]; future: number[] };
  // Plants not yet drawn into the market.
  deck: number[];
  resources: Record<Resource, number>;
  // Players finished with the current phase.
  done: string[];
  // Players who bought a plant this round. They can't bid again until the next round.
  boughtThisRound: string[];
  auction: Auction | null;
  results: Results | null;
  log: LogEntry[];
}

export type PowerGridAction =
  | { type: "start" }
  | { type: "nominate"; plant: number }
  | { type: "pass" }
  | { type: "bid"; amount: number }
  | { type: "fold" }
  | { type: "buyResource"; plant: number; units: number }
  | { type: "doneResources" }
  | { type: "buildCity"; city: string }
  | { type: "doneBuild" }
  | { type: "power"; plants: number[] };
