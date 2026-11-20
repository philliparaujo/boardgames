import { GameDoc } from "../../types";
import { CITIES, ROUTES } from "./map/europe";
import { TICKETS } from "./map/tickets";
import { isConnected, longestTrail, routePoints } from "./scoring";
import { canPass, parseAction, reduce, TRAINS_PER_PLAYER } from "./rules";
import { CardColor, TTRState } from "./types";

const TYPE = "ticketToRide";

function waitingGame(playerIds: string[]): GameDoc {
  return {
    gameType: TYPE,
    maxPlayers: 5,
    createdAt: 0,
    createdBy: playerIds[0],
    status: "waiting",
    players: playerIds.map((id) => ({ id, name: id })),
  };
}

// A started game where everyone has kept their starting tickets, so it's the first turn.
function playingGame(playerIds: string[]): GameDoc {
  let game = reduce(waitingGame(playerIds), { type: "start" }, playerIds[0]);
  for (const pid of playerIds) {
    const offer = (game.state as TTRState).offers[pid];
    game = reduce(game, { type: "keepTickets", ids: offer.ids.slice(0, 2) }, pid);
  }
  return game;
}

function stateOf(game: GameDoc): TTRState {
  return game.state as TTRState;
}

// Replace a player's hand so tests don't depend on the shuffle.
function withHand(game: GameDoc, playerId: string, hand: CardColor[]): GameDoc {
  const s = stateOf(game);
  return { ...game, state: { ...s, hands: { ...s.hands, [playerId]: hand } } };
}

function routeBetween(a: string, b: string) {
  const group = [a, b].sort().join("|");
  const route = ROUTES.find((r) => r.group === group);
  if (!route) throw new Error(`No route ${a}-${b}`);
  return route;
}

describe("map data", () => {
  it("only references known cities", () => {
    const ids = new Set(CITIES.map((c) => c.id));
    for (const r of ROUTES) {
      expect(ids.has(r.from)).toBe(true);
      expect(ids.has(r.to)).toBe(true);
    }
  });

  it("has unique route ids", () => {
    const ids = ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("can connect every destination ticket on the map", () => {
    const unreachable = TICKETS.filter((t) => !isConnected(ROUTES, t.from, t.to)).map((t) => `${t.from}-${t.to}`);
    expect(unreachable).toEqual([]);
  });
});

describe("setup", () => {
  it("deals hands, trains, and ticket offers, and starts only for the host", () => {
    const game = waitingGame(["a", "b"]);
    expect(() => reduce(game, { type: "start" }, "b")).toThrow(/host/);

    const started = reduce(game, { type: "start" }, "a");
    const s = stateOf(started);
    expect(started.status).toBe("started");
    expect(s.phase).toBe("setup");
    expect(s.hands.a).toHaveLength(4);
    expect(s.hands.b).toHaveLength(4);
    expect(s.trains.a).toBe(TRAINS_PER_PLAYER);
    expect(s.offers.a.ids).toHaveLength(4); // 1 long + 3 regular
    expect(s.offers.a.min).toBe(2);
  });

  it("moves to playing once every player keeps tickets", () => {
    const game = playingGame(["a", "b"]);
    expect(stateOf(game).phase).toBe("playing");
    expect(stateOf(game).order[stateOf(game).current]).toBe("a");
  });
});

describe("turns", () => {
  it("rejects actions from the wrong player", () => {
    const game = playingGame(["a", "b"]);
    expect(() => reduce(game, { type: "drawDeck" }, "b")).toThrow(/not your turn/);
  });

  it("ends the turn after two deck draws", () => {
    let game = playingGame(["a", "b"]);
    game = reduce(game, { type: "drawDeck" }, "a");
    expect(stateOf(game).current).toBe(0);
    game = reduce(game, { type: "drawDeck" }, "a");
    expect(stateOf(game).current).toBe(1);
  });
});

describe("claiming routes", () => {
  const route = routeBetween("Brest", "Paris"); // 3 black

  it("claims a route with matching cards and pays for it", () => {
    let game = playingGame(["a", "b"]);
    game = withHand(game, "a", ["black", "black", "black", "loco"]);
    game = reduce(game, { type: "claimRoute", routeId: route.id, payment: ["black", "black", "black"] }, "a");

    const s = stateOf(game);
    expect(s.owners[route.id]).toBe("a");
    expect(s.trains.a).toBe(TRAINS_PER_PLAYER - 3);
    expect(s.hands.a).toEqual(["loco"]);
    expect(s.current).toBe(1);
  });

  it("rejects the wrong color", () => {
    let game = playingGame(["a", "b"]);
    game = withHand(game, "a", ["red", "red", "red", "black"]);
    expect(() =>
      reduce(game, { type: "claimRoute", routeId: route.id, payment: ["red", "red", "red"] }, "a"),
    ).toThrow(/Payment must be black/);
  });

  it("requires ferry locomotives", () => {
    const ferry = ROUTES.find((r) => r.locos > 0);
    if (!ferry) throw new Error("No ferry route in the map data");
    let game = playingGame(["a", "b"]);
    const hand: CardColor[] = Array(ferry.length).fill(ferry.color === "gray" ? "red" : ferry.color);
    game = withHand(game, "a", hand);
    expect(() =>
      reduce(game, { type: "claimRoute", routeId: ferry.id, payment: hand }, "a"),
    ).toThrow(/rainbow/);
  });

  it("only one route between a pair in a 2-player game", () => {
    const doubles = ROUTES.filter((r) => r.group === routeBetween("Edinburgh", "London").group);
    expect(doubles.length).toBeGreaterThan(1);

    // "a" claims the first route of the pair; "b" then tries the second one.
    let game = playingGame(["a", "b"]);
    game = withHand(game, "a", ["loco", "loco", "loco", "loco"]);
    game = reduce(game, { type: "claimRoute", routeId: doubles[0].id, payment: ["loco", "loco", "loco", "loco"] }, "a");
    game = withHand(game, "b", ["loco", "loco", "loco", "loco"]);
    expect(() =>
      reduce(game, { type: "claimRoute", routeId: doubles[1].id, payment: ["loco", "loco", "loco", "loco"] }, "b"),
    ).toThrow(/taken/);
  });
});

describe("stations", () => {
  it("costs 1, then 2 cards, and needs one color", () => {
    let game = playingGame(["a", "b"]);
    game = withHand(game, "a", ["red", "red", "blue", "loco"]);
    expect(() => reduce(game, { type: "placeStation", city: "Paris", payment: ["red", "red"] }, "a")).toThrow(/costs 1/);

    game = reduce(game, { type: "placeStation", city: "Paris", payment: ["red"] }, "a");
    expect(stateOf(game).stations.Paris).toBe("a");
    expect(stateOf(game).current).toBe(1);

    // "a" now owns one station, so the second costs 2 cards of one color.
    game = reduce(game, { type: "drawDeck" }, "b");
    game = reduce(game, { type: "drawDeck" }, "b");
    game = withHand(game, "a", ["red", "blue", "loco"]);
    expect(() =>
      reduce(game, { type: "placeStation", city: "Roma", payment: ["red", "blue"] }, "a"),
    ).toThrow(/one color/);
  });

  it("third station costs 3, at most 3 stations, one per city", () => {
    let game = playingGame(["a", "b"]);
    const s = stateOf(game);
    game = { ...game, state: { ...s, stations: { Paris: "a", Roma: "a" } } };
    game = withHand(game, "a", ["red", "red", "loco", "red"]);
    expect(() => reduce(game, { type: "placeStation", city: "Paris", payment: ["red", "red", "loco"] }, "a")).toThrow(
      /already a station/,
    );
    game = reduce(game, { type: "placeStation", city: "Wien", payment: ["red", "red", "loco"] }, "a");
    expect(stateOf(game).stations.Wien).toBe("a");
    game = reduce(game, { type: "drawDeck" }, "b");
    game = reduce(game, { type: "drawDeck" }, "b");
    game = withHand(game, "a", ["red", "red", "red", "red"]);
    expect(() =>
      reduce(game, { type: "placeStation", city: "Madrid", payment: ["red", "red", "red", "red"] }, "a"),
    ).toThrow(/no stations left/);
  });

  it("can be built in a city with no claimed routes, but not in an opponent's station city", () => {
    let game = playingGame(["a", "b"]);
    game = withHand(game, "a", ["red"]);
    game = reduce(game, { type: "placeStation", city: "Lisboa", payment: ["red"] }, "a");
    game = withHand(game, "b", ["blue"]);
    expect(() => reduce(game, { type: "placeStation", city: "Lisboa", payment: ["blue"] }, "b")).toThrow(
      /already a station/,
    );
  });
});

// Replace parts of the state directly.
function patch(game: GameDoc, changes: Partial<TTRState>): GameDoc {
  return { ...game, state: { ...stateOf(game), ...changes } };
}

describe("destination tickets", () => {
  it("setup: unkept tickets (long or regular) and undealt long tickets leave the game", () => {
    let game = reduce(waitingGame(["a", "b"]), { type: "start" }, "a");
    const s0 = stateOf(game);
    expect(s0.longDeck).toEqual([]);
    expect(s0.box).toHaveLength(4); // 6 long tickets, 2 dealt
    const deckBefore = [...s0.ticketDeck];
    const offerA = s0.offers.a.ids;
    game = reduce(game, { type: "keepTickets", ids: offerA.slice(1, 3) }, "a");
    const s1 = stateOf(game);
    expect(s1.ticketDeck).toEqual(deckBefore);
    expect(s1.box).toEqual(expect.arrayContaining([offerA[0], offerA[3]]));
    expect(TICKETS[offerA[0]].long).toBe(true);
  });

  it("mid-game: draw 3, keep at least 1, unkept go to the bottom of the deck", () => {
    let game = playingGame(["a", "b"]);
    const top = stateOf(game).ticketDeck.slice(0, 3);
    game = reduce(game, { type: "drawTickets" }, "a");
    expect(stateOf(game).offers.a).toEqual({ ids: top, min: 1 });
    expect(() => reduce(game, { type: "keepTickets", ids: [] }, "a")).toThrow(/at least 1/);
    game = reduce(game, { type: "keepTickets", ids: [top[0]] }, "a");
    const deck = stateOf(game).ticketDeck;
    expect(deck.slice(-2)).toEqual([top[1], top[2]]);
    expect(deck[0]).not.toBe(top[1]);
    expect(stateOf(game).current).toBe(1);
  });
});

describe("drawing train cards", () => {
  it("a face-up locomotive as first card ends the draw; not allowed as second card", () => {
    let game = playingGame(["a", "b"]);
    game = patch(game, { faceUp: ["loco", "red", "blue", "green", "white"] });
    const after = reduce(game, { type: "drawFaceUp", slot: 0 }, "a");
    expect(stateOf(after).current).toBe(1);

    game = reduce(game, { type: "drawFaceUp", slot: 1 }, "a");
    const loco = stateOf(game).faceUp.indexOf("loco");
    expect(() => reduce(game, { type: "drawFaceUp", slot: loco }, "a")).toThrow(/rainbow as a second/);
  });

  it("a taken face-up card is replaced in the same slot; the others don't move", () => {
    let game = playingGame(["a", "b"]);
    game = patch(game, { faceUp: ["red", "blue", "green", "white", "black"], deck: ["yellow", "orange"], discard: [] });
    game = reduce(game, { type: "drawFaceUp", slot: 1 }, "a");
    expect(stateOf(game).faceUp).toEqual(["red", "orange", "green", "white", "black"]);
  });

  it("logs a deck reshuffle", () => {
    let game = playingGame(["a", "b"]);
    game = patch(game, { deck: [], discard: ["red", "red", "blue"] });
    game = reduce(game, { type: "drawDeck" }, "a");
    expect(stateOf(game).log.some((e) => /shuffled into a new deck/.test(e.text))).toBe(true);
  });

  it("three face-up locomotives: all five are discarded and replaced", () => {
    let game = playingGame(["a", "b"]);
    const s = stateOf(game);
    // Next deck card (deck pops from the end) is a loco, making 3 locos face up.
    const deck: CardColor[] = ["red", "red", "red", "blue", "blue", "blue", "loco"];
    game = patch(game, { faceUp: ["red", "loco", "loco", "green", "white"], deck, discard: [] });
    game = reduce(game, { type: "drawFaceUp", slot: 0 }, "a");
    const s2 = stateOf(game);
    expect(s2.faceUp.filter((c) => c === "loco").length).toBeLessThan(3);
    expect(s2.faceUp).toHaveLength(5);
    expect(s.order).toEqual(s2.order);
  });

  it("the face-up refill terminates when only locomotives are left", () => {
    let game = playingGame(["a", "b"]);
    // Only 3 locos and 2 other cards outside hands: no legal row exists.
    game = patch(game, { faceUp: ["red", "loco", "loco", "green", "blue"], deck: ["loco"], discard: [] });
    game = reduce(game, { type: "drawFaceUp", slot: 0 }, "a");
    expect(stateOf(game).faceUp.filter((c) => c === "loco")).toHaveLength(3);
  });

  it("reshuffles the discard pile when the deck is empty", () => {
    let game = playingGame(["a", "b"]);
    game = patch(game, { deck: [], discard: ["pink", "pink"] });
    game = reduce(game, { type: "drawDeck" }, "a");
    expect(stateOf(game).hands.a).toContain("pink");
  });

  it("ends the turn after one card when no second card can be drawn", () => {
    let game = playingGame(["a", "b"]);
    game = patch(game, { deck: ["pink"], discard: [], faceUp: ["loco"] });
    game = reduce(game, { type: "drawDeck" }, "a");
    expect(stateOf(game).current).toBe(1);
    expect(stateOf(game).drawnThisTurn).toBe(0);
  });

  it("can't draw when deck, discard and face-up row are empty", () => {
    let game = playingGame(["a", "b"]);
    game = patch(game, { deck: [], discard: [], faceUp: [] });
    expect(() => reduce(game, { type: "drawDeck" }, "a")).toThrow(/No cards left/);
  });
});

describe("tunnels", () => {
  // Paris–Pamplona: 4, blue, tunnel.
  const tunnel = ROUTES.find((r) => r.group === "Pamplona|Paris" && r.color === "blue")!;

  function tunnelGame(hand: CardColor[], deck: CardColor[]): GameDoc {
    let game = playingGame(["a", "b"]);
    game = withHand(game, "a", hand);
    // drawCard pops from the end, so the last cards are revealed first.
    return patch(game, { deck, discard: [] });
  }

  it("claims with no extra cost when nothing matches", () => {
    let game = tunnelGame(["blue", "blue", "blue", "blue"], ["red", "red", "green", "white", "black"]);
    game = reduce(game, { type: "claimRoute", routeId: tunnel.id, payment: ["blue", "blue", "blue", "blue"] }, "a");
    expect(stateOf(game).owners[tunnel.id]).toBe("a");
    expect(stateOf(game).discard).toHaveLength(7);
  });

  it("can't pay: cards return to hand, revealed cards are discarded, turn ends", () => {
    let game = tunnelGame(["blue", "blue", "blue", "blue"], ["red", "blue", "loco"]);
    game = reduce(game, { type: "claimRoute", routeId: tunnel.id, payment: ["blue", "blue", "blue", "blue"] }, "a");
    const s = stateOf(game);
    expect(s.owners[tunnel.id]).toBeUndefined();
    expect(s.hands.a).toEqual(["blue", "blue", "blue", "blue"]);
    expect(s.discard.sort()).toEqual(["blue", "loco", "red"]);
    expect(s.current).toBe(1);
    expect(s.pendingTunnel ?? null).toBeNull();
  });

  it("can pay: waits for payTunnel, which claims the route", () => {
    let game = tunnelGame(["blue", "blue", "blue", "blue", "blue", "loco"], ["red", "blue", "loco"]);
    game = reduce(game, { type: "claimRoute", routeId: tunnel.id, payment: ["blue", "blue", "blue", "blue"] }, "a");
    const pending = stateOf(game).pendingTunnel!;
    expect(pending.extra).toBe(2);
    expect(stateOf(game).current).toBe(0);
    expect(() => reduce(game, { type: "drawDeck" }, "a")).toThrow(/tunnel/);
    expect(() => reduce(game, { type: "payTunnel", payment: ["blue"] }, "a")).toThrow(/exactly 2/);
    game = reduce(game, { type: "payTunnel", payment: ["blue", "loco"] }, "a");
    const s = stateOf(game);
    expect(s.owners[tunnel.id]).toBe("a");
    expect(s.hands.a).toEqual([]);
    expect(s.trains.a).toBe(TRAINS_PER_PLAYER - 4);
    expect(s.current).toBe(1);
  });

  it("can decline: cards return to hand and the turn ends", () => {
    let game = tunnelGame(["blue", "blue", "blue", "blue", "blue"], ["red", "red", "blue"]);
    game = reduce(game, { type: "claimRoute", routeId: tunnel.id, payment: ["blue", "blue", "blue", "blue"] }, "a");
    game = reduce(game, { type: "declineTunnel" }, "a");
    const s = stateOf(game);
    expect(s.owners[tunnel.id]).toBeUndefined();
    expect(s.hands.a).toHaveLength(5);
    expect(s.current).toBe(1);
  });

  it("paid only with locomotives: only revealed locomotives count, and need locomotives", () => {
    let game = tunnelGame(["loco", "loco", "loco", "loco", "loco", "blue"], ["blue", "blue", "loco"]);
    game = reduce(game, { type: "claimRoute", routeId: tunnel.id, payment: ["loco", "loco", "loco", "loco"] }, "a");
    expect(stateOf(game).pendingTunnel!.extra).toBe(1);
    expect(() => reduce(game, { type: "payTunnel", payment: ["blue"] }, "a")).toThrow(/rainbows/);
    game = reduce(game, { type: "payTunnel", payment: ["loco"] }, "a");
    expect(stateOf(game).owners[tunnel.id]).toBe("a");
  });

  it("with no cards to reveal, the tunnel costs nothing extra", () => {
    let game = tunnelGame(["blue", "blue", "blue", "blue"], []);
    game = reduce(game, { type: "claimRoute", routeId: tunnel.id, payment: ["blue", "blue", "blue", "blue"] }, "a");
    expect(stateOf(game).owners[tunnel.id]).toBe("a");
  });
});

describe("end of game", () => {
  it("everyone, including the player who triggered it, gets one final turn", () => {
    let game = playingGame(["a", "b", "c"]);
    const route = routeBetween("Brest", "Paris"); // 3 trains
    game = patch(game, { trains: { a: 5, b: 45, c: 45 } });
    game = withHand(game, "a", ["black", "black", "black"]);
    game = reduce(game, { type: "claimRoute", routeId: route.id, payment: ["black", "black", "black"] }, "a");
    expect(stateOf(game).lastRoundBy).toBe("a");

    for (const pid of ["b", "c", "a"]) {
      expect(stateOf(game).phase).toBe("playing");
      expect(stateOf(game).order[stateOf(game).current]).toBe(pid);
      game = reduce(game, { type: "drawDeck" }, pid);
      game = reduce(game, { type: "drawDeck" }, pid);
    }
    expect(game.status).toBe("finished");
    expect(stateOf(game).results).not.toBeNull();
  });

  it("can't act after the game is over", () => {
    let game = playingGame(["a", "b"]);
    game = { ...game, status: "finished", state: { ...stateOf(game), phase: "finished" } };
    expect(() => reduce(game, { type: "drawDeck" }, "a")).toThrow();
  });
});

describe("pass", () => {
  it("is only allowed with no legal move", () => {
    let game = playingGame(["a", "b"]);
    expect(() => reduce(game, { type: "pass" }, "a")).toThrow(/no other move/);
    game = patch(game, { deck: [], discard: [], faceUp: [], ticketDeck: [] });
    game = withHand(game, "a", []);
    expect(canPass(stateOf(game), "a")).toBe(true);
    game = reduce(game, { type: "pass" }, "a");
    expect(stateOf(game).current).toBe(1);
  });
});

describe("parseAction", () => {
  it("rejects malformed actions with clear errors", () => {
    expect(() => parseAction(null)).toThrow(/Malformed/);
    expect(() => parseAction({ type: "fly" })).toThrow(/Unknown action type/);
    expect(() => parseAction({ type: "claimRoute", routeId: "x", payment: ["purple"] })).toThrow(/payment/);
    expect(() => parseAction({ type: "claimRoute", payment: [] })).toThrow(/routeId/);
    expect(() => parseAction({ type: "drawFaceUp", slot: "1" })).toThrow(/slot/);
    expect(() => parseAction({ type: "keepTickets", ids: [1.5] })).toThrow(/ids/);
    expect(parseAction({ type: "drawDeck", extra: 1 })).toEqual({ type: "drawDeck" });
  });
});

describe("scoring helpers", () => {
  it("uses the standard route point table", () => {
    expect([1, 2, 3, 4, 5, 6].map(routePoints)).toEqual([1, 2, 4, 7, 10, 15]);
  });

  it("finds the longest trail through connected routes", () => {
    const routes = [
      { from: "A", to: "B", length: 2 },
      { from: "B", to: "C", length: 3 },
      { from: "C", to: "D", length: 4 },
      { from: "B", to: "E", length: 9 },
    ].map((r, i) => ({ id: `r${i}`, color: "gray", locos: 0, tunnel: false, group: "", ...r })) as typeof ROUTES;
    // D-C-B-E uses every route except A-B: 4 + 3 + 9.
    expect(longestTrail(routes)).toBe(4 + 3 + 9);
  });
});
