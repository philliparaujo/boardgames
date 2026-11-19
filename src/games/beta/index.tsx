import { PlaceholderBoard } from "../PlaceholderBoard";
import { GameDefinition, GameViewProps } from "../types";

function BetaBoard({ game }: GameViewProps) {
  return <PlaceholderBoard title="Beta" game={game} />;
}

const beta: GameDefinition = {
  type: "beta",
  title: "Beta",
  minPlayers: 3,
  maxPlayers: 6,
  Component: BetaBoard,
};

export default beta;
