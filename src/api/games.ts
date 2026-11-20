import {
  collection,
  deleteDoc,
  doc,
  FirestoreError,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { getGameDefinition } from "../games/registry";
import { db, ensureSignedIn } from "../server/firebase";
import { GameDoc, GamePlayer, GameRecord } from "../types";

// One collection for every boardgame. Each document has a `gameType`.
const COLLECTION = "boardgame_games";
const LIST_LIMIT = 50;
// Waiting games with no activity for this long are left out of the lobby list.
export const STALE_WAITING_MS = 24 * 60 * 60 * 1000;

// Create a game of `gameType` with room for `maxPlayers`. The host is the first player.
export async function createGame(
  gameType: string,
  maxPlayers: number,
  host: GamePlayer,
): Promise<string> {
  const definition = getGameDefinition(gameType);
  if (!definition) throw new Error(`Unknown game type: ${gameType}`);
  if (maxPlayers < definition.minPlayers || maxPlayers > definition.maxPlayers) {
    throw new Error(
      `${definition.title} supports ${definition.minPlayers}-${definition.maxPlayers} players`,
    );
  }
  requireOnline();
  await ensureSignedIn();

  const id = uuidv4();
  const now = Date.now();
  const game: GameDoc = {
    gameType,
    maxPlayers,
    createdAt: now,
    createdBy: host.id,
    status: "waiting",
    players: [{ id: host.id, name: host.name }],
    version: 0,
    rev: newRev(),
    updatedAt: now,
  };
  await withFriendlyErrors(setDoc(doc(db, COLLECTION, id), game));
  return id;
}

// Join a game, or update your name if you're already in it.
// New players can only join while the game is waiting. Runs in a transaction,
// so two players can't both take the last seat.
export async function joinGame(gameId: string, player: GamePlayer): Promise<void> {
  requireOnline();
  await ensureSignedIn();

  const ref = doc(db, COLLECTION, gameId);
  await withFriendlyErrors(
    runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) throw new Error("Game not found");

      const game = snapshot.data() as GameDoc;
      const index = game.players.findIndex((p) => p.id === player.id);

      if (index !== -1) {
        if (game.players[index].name === player.name) return;
        const players = game.players.map((p, i) =>
          i === index ? { id: p.id, name: player.name } : p,
        );
        tx.update(ref, { players, ...bump(game) });
        return;
      }

      if (game.status !== "waiting") throw new Error("This game has already started");
      if (game.players.length >= game.maxPlayers) throw new Error("Game is full");
      tx.update(ref, {
        players: [...game.players, { id: player.id, name: player.name }],
        ...bump(game),
      });
    }),
  );
}

// Leave a game that hasn't started. If the host leaves, the next player becomes host;
// if nobody is left, the game is deleted.
export async function leaveGame(gameId: string, playerId: string): Promise<void> {
  requireOnline();
  await ensureSignedIn();

  const ref = doc(db, COLLECTION, gameId);
  await withFriendlyErrors(
    runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) return;

      const game = snapshot.data() as GameDoc;
      if (!game.players.some((p) => p.id === playerId)) return;
      if (game.status !== "waiting") throw new Error("You can't leave a game that has started");

      const players = game.players.filter((p) => p.id !== playerId);
      if (players.length === 0) {
        tx.delete(ref);
        return;
      }
      const createdBy = game.createdBy === playerId ? players[0].id : game.createdBy;
      tx.update(ref, { players, createdBy, ...bump(game) });
    }),
  );
}

// Applies an action to a game without saving it: parses it, runs the game's reducer,
// and stamps the bookkeeping fields. Throws if the action is rejected.
// Pure apart from the random `rev` (and whatever randomness the reducer uses).
export function applyAction(game: GameDoc, action: unknown, playerId: string): GameDoc {
  const definition = getGameDefinition(game.gameType);
  if (!definition?.reduce) throw new Error("This game doesn't accept actions");
  if (!game.players.some((p) => p.id === playerId)) {
    throw new Error("You're not a player in this game");
  }

  const parsed = definition.parseAction ? definition.parseAction(action) : action;
  // Reducers get their own copy, so a reducer that mutates can't corrupt the
  // snapshot the UI is showing.
  const next = definition.reduce(clone(toDoc(game)), parsed, playerId);
  return { ...toDoc(next), ...bump(game) };
}

export interface DispatchOptions {
  // The game as this client currently sees it. When given, the action is applied
  // to it immediately: an invalid action is rejected without a network round trip,
  // and `onPredicted` receives the expected result to show while the write is in
  // flight. If the server copy is still `base` when the transaction runs, that exact
  // result is saved (so shuffles and draws match what was shown); otherwise the
  // action is re-applied to the newer server copy.
  base?: GameRecord;
  onPredicted?: (game: GameRecord) => void;
}

// Send an action to a game. The game's reducer validates it and computes the
// new state inside one transaction (one read, one write). Errors thrown by the
// reducer are not retried; Firestore only retries its own contention errors.
// Resolves with the game as written.
export async function dispatchAction(
  gameId: string,
  action: unknown,
  playerId: string,
  options: DispatchOptions = {},
): Promise<GameRecord> {
  const { base, onPredicted } = options;
  requireOnline();

  let predicted: GameDoc | null = null;
  if (base) {
    predicted = applyAction(base, action, playerId);
    onPredicted?.({ ...predicted, id: gameId });
  }

  await ensureSignedIn();
  const ref = doc(db, COLLECTION, gameId);
  const written = await withFriendlyErrors(
    runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) throw new Error("Game not found");

      const current = snapshot.data() as GameDoc;
      const next =
        predicted && base?.rev !== undefined && current.rev === base.rev
          ? predicted
          : applyAction(current, action, playerId);
      tx.set(ref, next);
      return next;
    }),
  );
  return { ...written, id: gameId };
}

// Permanently delete a game, whatever its status. Used by the lobby to clear out old
// or abandoned games.
export async function deleteGame(gameId: string): Promise<void> {
  requireOnline();
  await ensureSignedIn();
  await withFriendlyErrors(deleteDoc(doc(db, COLLECTION, gameId)));
}

// True for a waiting game that has been idle long enough that it was likely abandoned.
export function isStale(game: GameDoc, now = Date.now()): boolean {
  return game.status === "waiting" && (game.updatedAt ?? game.createdAt) < now - STALE_WAITING_MS;
}

// Most recent games, newest first. Stale waiting games are left out unless
// `includeStale` is set (the lobby includes them so they can be deleted).
export async function listGames({ includeStale = false } = {}): Promise<GameRecord[]> {
  await ensureSignedIn();

  const q = query(
    collection(db, COLLECTION),
    orderBy("createdAt", "desc"),
    limit(LIST_LIMIT),
  );
  const snapshot = await withFriendlyErrors(getDocs(q));
  const now = Date.now();
  return snapshot.docs
    .map((d) => ({ ...(d.data() as GameDoc), id: d.id }))
    .filter((g) => includeStale || !isStale(g, now));
}

// Live updates for one game. Calls `onChange` with null if the game doesn't exist,
// and `onError` if the listener fails (it stops after an error).
// Returns an unsubscribe function.
export function subscribeGame(
  gameId: string,
  onChange: (game: GameRecord | null) => void,
  onError?: (error: Error) => void,
): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  ensureSignedIn().then(
    () => {
      if (cancelled) return;
      unsubscribe = onSnapshot(
        doc(db, COLLECTION, gameId),
        (snapshot) => {
          if (!snapshot.exists()) {
            // Offline, the cache reports "doesn't exist" for a game it never loaded.
            // Wait for the server instead of showing "Game not found".
            if (snapshot.metadata.fromCache) return;
            onChange(null);
            return;
          }
          onChange({ ...(snapshot.data() as GameDoc), id: snapshot.id });
        },
        (error) => onError?.(friendlyError(error)),
      );
    },
    (error) => {
      if (!cancelled) onError?.(friendlyError(error));
    },
  );

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

// Of two copies of the same game, the one with more writes (ties go to `a`).
export function newerGame<T extends GameDoc>(a: T, b: T | null | undefined): T {
  if (!b) return a;
  return (b.version ?? 0) > (a.version ?? 0) ? b : a;
}

function bump(game: GameDoc): Pick<GameDoc, "version" | "rev" | "updatedAt"> {
  return { version: (game.version ?? 0) + 1, rev: newRev(), updatedAt: Date.now() };
}

function newRev(): string {
  return uuidv4();
}

// Drops the Firestore id so it isn't written into the document.
function toDoc(game: GameDoc | GameRecord): GameDoc {
  const { id, ...rest } = game as GameRecord;
  return rest;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Fails fast when the browser knows it's offline. Transactions need the server, and
// otherwise they retry for several seconds before giving up.
function requireOnline(): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("You're offline. Check your connection and try again.");
  }
}

async function withFriendlyErrors<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    throw friendlyError(error);
  }
}

// Turns Firestore's errors into messages a player can act on. Errors thrown by
// reducers (plain Errors) pass through unchanged.
export function friendlyError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(String(error));
  const code = (error as FirestoreError).code;
  if (error.name !== "FirebaseError" || !code) return error;
  switch (code) {
    case "unavailable":
    case "deadline-exceeded":
      return new Error("Can't reach the server. Check your connection and try again.");
    case "failed-precondition":
      // Also used for "query needs an index", whose message has a link to create it.
      if (/index/i.test(error.message)) return error;
      return new Error("Other players were moving at the same time. Try again.");
    case "aborted":
      return new Error("Other players were moving at the same time. Try again.");
    case "permission-denied":
    case "unauthenticated":
      return new Error("The server refused the request (permission denied).");
    case "resource-exhausted":
      return new Error("The server's daily quota is used up. Try again later.");
    default:
      return error;
  }
}
