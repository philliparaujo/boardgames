import { v4 as uuidv4 } from "uuid";
import { GamePlayer } from "../types";

// Namespaced so this app doesn't collide with other apps on the same origin
// (e.g. both running on localhost:3000).
const NAME_KEY = "boardgames.playerName";
const ID_KEY = "boardgames.playerId";

// Identity lives in sessionStorage, so it is per tab: a refresh keeps it, but a new
// tab (or reopening a closed one) is a new player. That lets one person test several
// players in one browser. A player who loses their tab can take their seat back
// with "Rejoin as" on the game page (see takeSeat).

export const MAX_ID_LENGTH = 64;

// Why a custom player id can't be used, or null if it's fine.
export function playerIdError(id: string): string | null {
  if (id.length > MAX_ID_LENGTH) return `Player ID must be at most ${MAX_ID_LENGTH} characters.`;
  if (/\s/.test(id)) return "Player ID can't contain spaces.";
  return null;
}

// "Log in": store a display name and a player id. With `customId`, that id is used
// (e.g. to get back into a game after disconnecting); otherwise the tab's existing
// id is reused, or a new random one is created.
export function login(name: string, customId?: string): GamePlayer {
  const custom = customId?.trim();
  if (custom) {
    const error = playerIdError(custom);
    if (error) throw new Error(error);
  }
  const id = custom || sessionStorage.getItem(ID_KEY) || uuidv4();
  sessionStorage.setItem(ID_KEY, id);
  sessionStorage.setItem(NAME_KEY, name);
  return { id, name };
}

// The id this tab will use, if it has one (even when not logged in with a name).
export function getStoredId(): string | null {
  return sessionStorage.getItem(ID_KEY);
}

// Become an existing player (id and name), e.g. to get back into a game after
// closing the tab.
export function takeSeat(player: GamePlayer): GamePlayer {
  sessionStorage.setItem(ID_KEY, player.id);
  sessionStorage.setItem(NAME_KEY, player.name);
  return { id: player.id, name: player.name };
}

export function logout(): void {
  sessionStorage.removeItem(NAME_KEY);
  sessionStorage.removeItem(ID_KEY);
}

export function getPlayer(): GamePlayer | null {
  const id = sessionStorage.getItem(ID_KEY);
  const name = sessionStorage.getItem(NAME_KEY);
  if (!id || !name) return null;
  return { id, name };
}
