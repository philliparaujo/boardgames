import { GameDefinition } from "../types";
import { PowerGridView } from "./PowerGridView";
import { MAX_PLAYERS, MIN_PLAYERS, parseAction, reduce } from "./rules";

const powerGrid: GameDefinition = {
  type: "powerGrid",
  title: "Power Grid (Northmarch)",
  summary: "Build a power network, buy fuel and earn income. A variant on a fictional map.",
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  parseAction,
  reduce,
  Component: PowerGridView,
};

export default powerGrid;
