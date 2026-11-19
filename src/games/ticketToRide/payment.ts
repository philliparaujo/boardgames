// Picks the cards a player pays with. The reducer validates payments; these helpers
// only choose a sensible one so the player doesn't have to.
import { RouteData } from "./map/europe";
import { CardColor, TRAIN_COLORS, TrainColor } from "./types";

// Card types in display order (locomotives first, then the train colors).
export const CARD_ORDER: CardColor[] = ["loco", ...TRAIN_COLORS];

export function countOf(hand: CardColor[], c: CardColor): number {
  return hand.filter((x) => x === c).length;
}

// Cards for a station: one color (preferred) plus locomotives to fill the cost.
// With no color, the station is paid with locomotives only.
export function stationPayment(
  hand: CardColor[],
  cost: number,
  color: TrainColor | null,
): CardColor[] | null {
  const payment: CardColor[] = [];
  let need = cost;
  if (color) {
    const n = Math.min(countOf(hand, color), need);
    payment.push(...Array<CardColor>(n).fill(color));
    need -= n;
  }
  const locos = Math.min(countOf(hand, "loco"), need);
  payment.push(...Array<CardColor>(locos).fill("loco"));
  need -= locos;
  return need > 0 ? null : payment;
}

// Cards to pay for a route, using the fewest locomotives possible.
// `grayColor` is the color used for a gray route. Returns null if the hand can't cover it.
export function autoPayment(
  hand: CardColor[],
  route: RouteData,
  grayColor: TrainColor | null,
): CardColor[] | null {
  const payment: CardColor[] = [];

  let locos = countOf(hand, "loco");
  if (locos < route.locos) return null;
  payment.push(...Array<CardColor>(route.locos).fill("loco"));
  locos -= route.locos;

  let need = route.length - route.locos;
  const color = route.color === "gray" ? grayColor : route.color;
  if (color) {
    const n = Math.min(countOf(hand, color), need);
    payment.push(...Array<CardColor>(n).fill(color));
    need -= n;
  }

  const extraLocos = Math.min(locos, need);
  payment.push(...Array<CardColor>(extraLocos).fill("loco"));
  need -= extraLocos;

  return need > 0 ? null : payment;
}

// Colors that can pay for a gray route, best first (most cards of that color, so the
// fewest locomotives are spent).
export function grayRouteColors(hand: CardColor[], route: RouteData): TrainColor[] {
  return TRAIN_COLORS.filter((c) => countOf(hand, c) > 0 && autoPayment(hand, route, c)).sort(
    (a, b) => countOf(hand, b) - countOf(hand, a),
  );
}

// The payment for a route: for gray routes, `preferred` if it works, else the best color.
export function routePayment(
  hand: CardColor[],
  route: RouteData,
  preferred: TrainColor | null,
): CardColor[] | null {
  if (route.color !== "gray") return autoPayment(hand, route, null);
  if (preferred) {
    const p = autoPayment(hand, route, preferred);
    if (p) return p;
  }
  const best = grayRouteColors(hand, route)[0] ?? null;
  // A gray route can also be paid with locomotives alone.
  return autoPayment(hand, route, best);
}

// Colors that can pay for a station of `cost`, best first. `null` means locomotives only.
export function stationColors(hand: CardColor[], cost: number): (TrainColor | null)[] {
  const colors: (TrainColor | null)[] = TRAIN_COLORS.filter(
    (c) => countOf(hand, c) > 0 && stationPayment(hand, cost, c),
  ).sort((a, b) => countOf(hand, b) - countOf(hand, a));
  if (countOf(hand, "loco") >= cost) colors.push(null);
  return colors;
}

export function mostCommonColor(hand: CardColor[]): TrainColor | null {
  let best: TrainColor | null = null;
  let bestCount = 0;
  for (const c of TRAIN_COLORS) {
    const n = countOf(hand, c);
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

// "3 blue, 1 loco" style summary of a payment.
export function summarize(payment: CardColor[]): string {
  return [...TRAIN_COLORS, "loco" as CardColor]
    .map((c) => ({ c, n: countOf(payment, c) }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${x.c}`)
    .join(", ");
}

// Extra cards for a tunnel: `payColor` cards first, then locomotives.
// `payColor` is "loco" when the route was paid with locomotives only.
export function tunnelPayment(
  hand: CardColor[],
  payColor: CardColor,
  extra: number,
): CardColor[] | null {
  const payment: CardColor[] = [];
  let need = extra;
  if (payColor !== "loco") {
    const n = Math.min(countOf(hand, payColor), need);
    payment.push(...Array<CardColor>(n).fill(payColor));
    need -= n;
  }
  const locos = Math.min(countOf(hand, "loco"), need);
  payment.push(...Array<CardColor>(locos).fill("loco"));
  need -= locos;
  return need > 0 ? null : payment;
}
