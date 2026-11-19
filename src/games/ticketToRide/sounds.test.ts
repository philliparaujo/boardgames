import { GameDoc } from "../../types";
import { reduce } from "./rules";
import { soundsForChange } from "./sounds";
import { TTRState } from "./types";

const players = ["a", "b"];

function playing(): GameDoc {
  let game = reduce(
    {
      gameType: "ticketToRide",
      maxPlayers: 5,
      createdAt: 0,
      createdBy: "a",
      status: "waiting",
      players: players.map((id) => ({ id, name: id })),
    },
    { type: "start" },
    "a",
  );
  for (const pid of players) {
    const offer = (game.state as TTRState).offers[pid];
    game = reduce(game, { type: "keepTickets", ids: offer.ids.slice(0, 2) }, pid);
  }
  return game;
}

const st = (g: GameDoc) => g.state as TTRState;

describe("soundsForChange", () => {
  it("plays a draw sound, then your-turn chime for the next player", () => {
    const g0 = playing();
    const first = st(g0).order[st(g0).current];
    const other = players.find((p) => p !== first) as string;
    const g1 = reduce(g0, { type: "drawDeck" }, first);
    expect(soundsForChange(st(g0), st(g1), first)).toEqual(["draw"]);
    const g2 = reduce(g1, { type: "drawDeck" }, first);
    expect(soundsForChange(st(g1), st(g2), other)).toEqual(["draw", "yourTurn"]);
    expect(soundsForChange(st(g1), st(g2), first)).toEqual(["draw"]);
  });

  it("chimes your turn when setup finishes and you go first", () => {
    let game = reduce(
      {
        gameType: "ticketToRide",
        maxPlayers: 5,
        createdAt: 0,
        createdBy: "a",
        status: "waiting",
        players: players.map((id) => ({ id, name: id })),
      },
      { type: "start" },
      "a",
    );
    const order = st(game).order;
    const before = st(game);
    for (const pid of order) {
      const offer = st(game).offers[pid];
      game = reduce(game, { type: "keepTickets", ids: offer.ids.slice(0, 2) }, pid);
    }
    expect(soundsForChange(before, st(game), order[0])).toContain("yourTurn");
    expect(soundsForChange(before, st(game), order[1])).not.toContain("yourTurn");
  });

  it("plays tickets and claim sounds", () => {
    const g0 = playing();
    const first = st(g0).order[st(g0).current];
    const g1 = reduce(g0, { type: "drawTickets" }, first);
    expect(soundsForChange(st(g0), st(g1), first)).toEqual(["tickets"]);

    const claimed = { ...st(g0), owners: { ...st(g0).owners, "Brest|Paris#0": first } };
    expect(soundsForChange(st(g0), claimed, first)[0]).toBe("claim");
  });
});
