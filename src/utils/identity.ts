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

// "Log in": store a display name and a player id (created once, then reused).
export function login(name: string): GamePlayer {
  let id = sessionStorage.getItem(ID_KEY);
  if (!id) {
    id = uuidv4();
    sessionStorage.setItem(ID_KEY, id);
  }
  sessionStorage.setItem(NAME_KEY, name);
  return { id, name };
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
