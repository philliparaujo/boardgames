import { renderToStaticMarkup } from "react-dom/server";
import { GameRecord } from "../../types";
import { PowerGridView } from "./PowerGridView";
import { reduce } from "./rules";
import { PowerGridState } from "./types";

const players = [
  { id: "alice", name: "Alice" },
  { id: "bob", name: "Bob" },
];

function record(status: "waiting" | "started" | "finished", state?: PowerGridState): GameRecord {
  return {
    id: "g1",
    gameType: "powerGrid",
    maxPlayers: 4,
    createdAt: 0,
    createdBy: "alice",
    status,
    players,
    state,
  };
}

function render(game: GameRecord, playerId: string): string {
  return renderToStaticMarkup(
    <PowerGridView game={game} playerId={playerId} onAction={async () => {}} />,
  );
}

describe("PowerGridView", () => {
  it("renders the lobby before the game starts", () => {
    const html = render(record("waiting"), "alice");
    expect(html).toContain("Start game");
    expect(html).toContain("Bob");
  });

  it("hides the start button from players who aren't the host", () => {
    const html = render(record("waiting"), "bob");
    expect(html).not.toContain("Start game");
  });

  it("renders a started game with the map and the player's controls", () => {
    const started = reduce(
      { ...record("waiting"), status: "waiting" },
      { type: "start" },
      "alice",
    );
    const game: GameRecord = { ...started, id: "g1" } as GameRecord;
    const html = render(game, game.state ? (game.state as PowerGridState).current! : "alice");
    expect(html).toContain("Northmarch");
    expect(html).toContain("Your turn");
    expect(html).toContain("Auction");
    expect(html).toContain("Halden");
  });

  it("renders the final scores once the game is over", () => {
    const started = reduce({ ...record("waiting") }, { type: "start" }, "alice");
    const s = started.state as PowerGridState;
    const finished = record("finished", {
      ...s,
      results: {
        scores: s.order.map((id) => ({ id, cities: 0, capacity: 0, money: 50 })),
        winners: [s.order[0]],
      },
    });
    const html = render(finished, "alice");
    expect(html).toContain("Final scores");
    expect(html).toContain("Game over");
  });
});
