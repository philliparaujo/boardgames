import beta from "./beta";
import powerGrid from "./powerGrid";
import ticketToRide from "./ticketToRide";
import { AnyGameDefinition } from "./types";

// To add a game: create a folder under src/games/ that exports a GameDefinition,
// then add it to this list.
export const GAME_DEFINITIONS: AnyGameDefinition[] = [ticketToRide, powerGrid, beta];

// `type` is the key stored in Firestore, so two games sharing one would mix up documents.
assertUniqueTypes(GAME_DEFINITIONS);

export function getGameDefinition(type: string): AnyGameDefinition | null {
  return GAME_DEFINITIONS.find((g) => g.type === type) ?? null;
}

export function assertUniqueTypes(definitions: AnyGameDefinition[]): void {
  const seen = new Set<string>();
  for (const def of definitions) {
    if (seen.has(def.type)) throw new Error(`Duplicate game type in registry: ${def.type}`);
    seen.add(def.type);
  }
}
