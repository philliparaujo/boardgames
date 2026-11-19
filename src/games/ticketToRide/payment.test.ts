import { ROUTES } from "./map/europe";
import {
  autoPayment,
  grayRouteColors,
  mostCommonColor,
  routePayment,
  stationColors,
  stationPayment,
  summarize,
  tunnelPayment,
} from "./payment";
import { CardColor } from "./types";

const route = (pred: (r: (typeof ROUTES)[number]) => boolean) => {
  const r = ROUTES.find(pred);
  if (!r) throw new Error("no such route in the map");
  return r;
};

describe("autoPayment", () => {
  const red3 = route((r) => r.color === "red" && r.length === 3 && r.locos === 0);

  it("pays with the route color and uses locomotives only to fill gaps", () => {
    expect(autoPayment(["red", "red", "red", "loco"], red3, null)).toEqual(["red", "red", "red"]);
    expect(autoPayment(["red", "red", "loco", "blue"], red3, null)).toEqual(["red", "red", "loco"]);
  });

  it("returns null when the hand can't cover the route", () => {
    expect(autoPayment(["red", "blue", "loco"], red3, null)).toBeNull();
  });

  it("pays the ferry locomotives first", () => {
    const ferry = route((r) => r.locos > 0);
    const hand: CardColor[] = [...Array<CardColor>(ferry.length).fill("loco")];
    const p = autoPayment(hand, ferry, "red");
    expect(p).not.toBeNull();
    expect(p!.filter((c) => c === "loco").length).toBeGreaterThanOrEqual(ferry.locos);
    expect(autoPayment(Array<CardColor>(ferry.length).fill("red"), ferry, "red")).toBeNull();
  });
});

describe("gray routes", () => {
  const gray2 = route((r) => r.color === "gray" && r.length === 2 && r.locos === 0);

  it("lists payable colors with the largest holding first", () => {
    const hand: CardColor[] = ["blue", "green", "green", "green", "red"];
    expect(grayRouteColors(hand, gray2)).toEqual(["green"]);
    expect(grayRouteColors([...hand, "loco"], gray2)).toEqual(["green", "red", "blue"]);
  });

  it("uses the preferred color when it works, else the best one", () => {
    const hand: CardColor[] = ["blue", "blue", "green", "green", "green"];
    expect(routePayment(hand, gray2, "blue")).toEqual(["blue", "blue"]);
    expect(routePayment(hand, gray2, "red")).toEqual(["green", "green"]);
    expect(routePayment(["loco", "loco"], gray2, null)).toEqual(["loco", "loco"]);
  });
});

describe("stations", () => {
  it("pays one color plus locomotives", () => {
    expect(stationPayment(["red", "loco"], 2, "red")).toEqual(["red", "loco"]);
    expect(stationPayment(["red"], 2, "red")).toBeNull();
    expect(stationPayment(["loco", "loco"], 2, null)).toEqual(["loco", "loco"]);
  });

  it("lists colors that can pay, with locomotives-only last", () => {
    expect(stationColors(["red", "red", "blue", "loco", "loco"], 2)).toEqual(["red", "blue", null]);
    expect(stationColors(["red"], 2)).toEqual([]);
  });
});

it("finds the most common color and summarizes payments", () => {
  expect(mostCommonColor(["loco", "blue", "red", "blue"])).toBe("blue");
  expect(mostCommonColor(["loco"])).toBeNull();
  expect(summarize(["loco", "blue", "blue"])).toBe("2 blue, 1 loco");
});

it("pays tunnel extras with the route's color, then locomotives", () => {
  expect(tunnelPayment(["red", "loco", "blue"], "red", 2)).toEqual(["red", "loco"]);
  expect(tunnelPayment(["red", "loco"], "loco", 1)).toEqual(["loco"]);
  expect(tunnelPayment(["blue"], "red", 1)).toBeNull();
  expect(tunnelPayment([], "red", 0)).toEqual([]);
});
