import { ComponentType } from "react";
import { GameDoc, GameRecord } from "../types";

// Props every game's in-game view receives.
// `S` is the game's state type and `A` its action type (both default to unknown).
export interface GameViewProps<S = unknown, A = unknown> {
  game: GameRecord<S>;
  playerId: string;
  // Sends an action to the game's reducer. Rejects with an Error if the action is invalid.
  // The view re-renders with the predicted result right away (before the server confirms).
  onAction: (action: A) => Promise<void>;
}

// Everything the app needs to know about one game type.
export interface GameDefinition<S = unknown, A = unknown> {
  // Stored in Firestore as `gameType`. Must be unique (checked in registry.ts).
  type: string;
  title: string;
  // One line shown when choosing which game to start.
  summary?: string;
  minPlayers: number;
  maxPlayers: number;
  // Optional: turns an untrusted action into a typed one, or throws an Error.
  // Called before `reduce`.
  parseAction?: (action: unknown) => A;
  // Applies an action to a game document and returns the new document.
  // Throw an Error to reject the action. Games without a reducer can't take actions.
  // Must not mutate `game`. It runs on the acting player's client, both to predict
  // the result and inside the Firestore transaction.
  reduce?: (game: GameDoc<S>, action: A, playerId: string) => GameDoc<S>;
  Component: ComponentType<GameViewProps<S, A>>;
}

// A definition of any game, as stored in the registry.
export type AnyGameDefinition = GameDefinition<any, any>;
