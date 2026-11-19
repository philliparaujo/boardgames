export interface GamePlayer {
  id: string;
  name: string;
}

export type GameStatus = "waiting" | "started" | "finished";

// What is stored in Firestore for each game. `S` is the game-specific state.
export interface GameDoc<S = unknown> {
  gameType: string;
  maxPlayers: number;
  createdAt: number;
  createdBy: string;
  status: GameStatus;
  players: GamePlayer[];
  // Game-specific state, owned by the game's reducer.
  state?: S;
  // Bookkeeping written by src/api/games.ts on every write (missing on older games).
  // version: counts writes, so the UI can tell which of two copies is newer.
  // rev: random id of the latest write, so a result computed ahead of time can be
  //   checked against the document it was computed from.
  // updatedAt: last write time (ms), used to hide abandoned lobbies.
  version?: number;
  rev?: string;
  updatedAt?: number;
}

// A game as the app sees it: the stored document plus its Firestore id.
export interface GameRecord<S = unknown> extends GameDoc<S> {
  id: string;
}
