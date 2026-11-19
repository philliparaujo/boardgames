// Ticket to Ride: Europe map data.
//
// Transcribed from a photo of the board, then corrected against two reviews of the
// board. Ids are ASCII (they match the destination tickets); DISPLAY_NAMES gives
// the printed spelling. Ferry locomotive counts are not known exactly and default
// to 1 (the anchor count was not clear in the photo); check them against the board.
// Consistency checks live in rules.test.ts.

import { RouteColor } from "../types";

export interface CityData {
  id: string;
  // Position on the board, in board pixels (the board is BOARD_WIDTH x BOARD_HEIGHT).
  // Taken from the printed board layout, which spaces crowded areas better than a real map.
  x: number;
  y: number;
}

export const BOARD_WIDTH = 1200;
export const BOARD_HEIGHT = 820;

// [from, to, length, color, ferryLocomotives, tunnel]
type RouteSpec = [string, string, number, RouteColor, number, boolean];

export const CITIES: CityData[] = [
  { id: "Edinburgh", x: 183, y: 85 },
  { id: "London", x: 265, y: 245 },
  { id: "Brest", x: 155, y: 385 },
  { id: "Dieppe", x: 255, y: 352 },
  { id: "Paris", x: 310, y: 405 },
  { id: "Pamplona", x: 240, y: 575 },
  { id: "Bruxelles", x: 352, y: 290 },
  { id: "Amsterdam", x: 370, y: 240 },
  { id: "Essen", x: 450, y: 250 },
  { id: "Frankfurt", x: 450, y: 345 },
  { id: "Berlin", x: 583, y: 263 },
  { id: "Kobenhavn", x: 547, y: 140 },
  { id: "Stockholm", x: 667, y: 52 },
  { id: "Danzig", x: 712, y: 190 },
  { id: "Riga", x: 803, y: 88 },
  { id: "Petrograd", x: 995, y: 70 },
  { id: "Wilno", x: 893, y: 243 },
  { id: "Smolensk", x: 1013, y: 245 },
  { id: "Moskva", x: 1120, y: 238 },
  { id: "Warszawa", x: 768, y: 270 },
  { id: "Kyiv", x: 940, y: 330 },
  { id: "Kharkov", x: 1095, y: 368 },
  { id: "Rostov", x: 1142, y: 470 },
  { id: "Sochi", x: 1150, y: 545 },
  { id: "Erzurum", x: 1120, y: 690 },
  { id: "Angora", x: 1020, y: 700 },
  { id: "Smyrna", x: 885, y: 760 },
  { id: "Constantinople", x: 935, y: 665 },
  { id: "Sevastopol", x: 1035, y: 543 },
  { id: "Athina", x: 790, y: 730 },
  { id: "Sofia", x: 805, y: 600 },
  { id: "Bucuresti", x: 875, y: 520 },
  { id: "Budapest", x: 715, y: 435 },
  { id: "Wien", x: 648, y: 415 },
  { id: "Zagrab", x: 635, y: 520 },
  { id: "Sarajevo", x: 733, y: 588 },
  { id: "Munchen", x: 518, y: 392 },
  { id: "Zurich", x: 433, y: 455 },
  { id: "Venezia", x: 533, y: 505 },
  { id: "Marseille", x: 410, y: 573 },
  { id: "Barcelona", x: 255, y: 690 },
  { id: "Madrid", x: 127, y: 670 },
  { id: "Cadiz", x: 128, y: 760 },
  { id: "Lisboa", x: 48, y: 690 },
  { id: "Roma", x: 548, y: 610 },
  { id: "Brindisi", x: 645, y: 640 },
  { id: "Palermo", x: 592, y: 762 },
];

// Printed spelling for cities whose ids are ASCII.
const DISPLAY_NAMES: Record<string, string> = {
  Munchen: "München",
  Zurich: "Zürich",
  Kobenhavn: "København",
  Cadiz: "Cádiz",
};

export function cityLabel(id: string): string {
  return DISPLAY_NAMES[id] ?? id;
}

const ROUTE_SPECS: RouteSpec[] = [
  // Britain and the Channel
  ["Edinburgh", "London", 4, "black", 0, false],
  ["Edinburgh", "London", 4, "orange", 0, false],
  ["London", "Amsterdam", 2, "gray", 2, false],
  ["London", "Dieppe", 2, "gray", 1, false],
  ["London", "Dieppe", 2, "gray", 1, false],
  ["Brest", "Paris", 3, "black", 0, false],
  ["Brest", "Dieppe", 2, "orange", 0, false],
  ["Brest", "Pamplona", 4, "pink", 0, false],
  ["Dieppe", "Paris", 1, "gray", 0, false],
  ["Dieppe", "Bruxelles", 2, "green", 0, false],

  // France and the Low Countries
  ["Paris", "Bruxelles", 2, "yellow", 0, false],
  ["Paris", "Bruxelles", 2, "red", 0, false],
  ["Paris", "Pamplona", 4, "blue", 0, true],
  ["Paris", "Pamplona", 4, "green", 0, true],
  ["Paris", "Frankfurt", 3, "white", 0, false],
  ["Paris", "Frankfurt", 3, "orange", 0, false],
  ["Paris", "Zurich", 3, "gray", 0, false],
  ["Paris", "Marseille", 4, "gray", 0, false],
  ["Bruxelles", "Amsterdam", 1, "black", 0, false],
  ["Bruxelles", "Frankfurt", 2, "blue", 0, false],
  ["Amsterdam", "Essen", 3, "yellow", 0, false],
  ["Amsterdam", "Frankfurt", 2, "white", 0, false],
  ["Essen", "Frankfurt", 2, "green", 0, false],
  ["Essen", "Kobenhavn", 3, "gray", 1, false],
  ["Essen", "Kobenhavn", 3, "gray", 1, false],
  ["Essen", "Berlin", 2, "blue", 0, false],

  // Germany, Scandinavia, and the north
  ["Berlin", "Danzig", 4, "gray", 0, false],
  ["Berlin", "Warszawa", 4, "pink", 0, false],
  ["Berlin", "Warszawa", 4, "yellow", 0, false],
  ["Berlin", "Frankfurt", 3, "black", 0, false],
  ["Berlin", "Frankfurt", 3, "red", 0, false],
  ["Berlin", "Wien", 3, "green", 0, false],
  ["Frankfurt", "Munchen", 2, "pink", 0, false],
  ["Kobenhavn", "Stockholm", 3, "yellow", 0, false],
  ["Kobenhavn", "Stockholm", 3, "white", 0, false],
  ["Stockholm", "Petrograd", 8, "gray", 0, true],
  ["Danzig", "Warszawa", 2, "gray", 0, false],
  ["Danzig", "Riga", 3, "black", 0, false],
  ["Riga", "Wilno", 4, "green", 0, false],
  ["Riga", "Petrograd", 4, "gray", 0, false],
  ["Warszawa", "Wilno", 3, "red", 0, false],
  ["Warszawa", "Kyiv", 4, "gray", 0, false],
  ["Wilno", "Smolensk", 3, "yellow", 0, false],
  ["Wilno", "Petrograd", 4, "blue", 0, false],
  ["Wilno", "Kyiv", 2, "gray", 0, false],
  ["Petrograd", "Moskva", 4, "white", 0, false],
  ["Smolensk", "Moskva", 2, "orange", 0, false],
  ["Smolensk", "Kyiv", 3, "red", 0, false],
  ["Moskva", "Kharkov", 4, "gray", 0, false],
  ["Kyiv", "Kharkov", 4, "gray", 0, false],
  ["Kyiv", "Budapest", 6, "gray", 0, true],
  ["Kyiv", "Bucuresti", 4, "gray", 0, false],

  // Central Europe
  ["Munchen", "Wien", 3, "orange", 0, false],
  ["Munchen", "Venezia", 2, "blue", 0, true],
  ["Munchen", "Zurich", 2, "yellow", 0, true],
  ["Zurich", "Venezia", 2, "green", 0, true],
  ["Zurich", "Marseille", 2, "pink", 0, true],
  ["Wien", "Warszawa", 4, "blue", 0, false],
  ["Wien", "Budapest", 1, "red", 0, false],
  ["Wien", "Budapest", 1, "white", 0, false],
  ["Wien", "Zagrab", 2, "gray", 0, false],
  ["Budapest", "Zagrab", 2, "orange", 0, false],
  ["Budapest", "Bucuresti", 4, "gray", 0, true],
  ["Budapest", "Sarajevo", 3, "pink", 0, false],
  ["Zagrab", "Sarajevo", 3, "red", 0, false],
  ["Zagrab", "Venezia", 2, "gray", 0, false],
  ["Sarajevo", "Sofia", 2, "gray", 0, true],

  // The south and Italy
  ["Marseille", "Roma", 4, "gray", 0, true],
  ["Venezia", "Roma", 2, "black", 0, false],
  ["Roma", "Brindisi", 2, "white", 0, false],
  ["Roma", "Palermo", 4, "gray", 1, false],
  ["Brindisi", "Athina", 4, "gray", 4, false],
  ["Brindisi", "Palermo", 3, "gray", 1, false],
  ["Palermo", "Smyrna", 6, "gray", 2, false],
  ["Sofia", "Athina", 3, "pink", 0, false],
  ["Athina", "Sarajevo", 4, "green", 0, false],
  ["Athina", "Smyrna", 2, "gray", 1, false],

  // Iberia
  ["Pamplona", "Madrid", 3, "black", 0, false],
  ["Pamplona", "Madrid", 3, "white", 0, false],
  ["Pamplona", "Barcelona", 2, "gray", 0, false],
  ["Barcelona", "Marseille", 4, "gray", 0, false],
  ["Pamplona", "Marseille", 4, "red", 0, true],
  ["Madrid", "Barcelona", 2, "yellow", 0, false],
  ["Madrid", "Lisboa", 3, "pink", 0, false],
  ["Madrid", "Cadiz", 3, "orange", 0, false],
  ["Lisboa", "Cadiz", 2, "blue", 0, false],

  // The east and Black Sea
  ["Bucuresti", "Sofia", 2, "gray", 0, true],
  ["Bucuresti", "Constantinople", 3, "yellow", 0, false],
  ["Bucuresti", "Sevastopol", 4, "white", 0, false],
  ["Sofia", "Constantinople", 3, "blue", 0, false],
  ["Constantinople", "Smyrna", 2, "gray", 0, true],
  ["Constantinople", "Angora", 2, "gray", 0, true],
  ["Constantinople", "Sevastopol", 4, "gray", 2, false],
  ["Sevastopol", "Rostov", 4, "gray", 0, false],
  ["Sevastopol", "Sochi", 2, "gray", 1, false],
  ["Sevastopol", "Erzurum", 4, "gray", 2, false],
  ["Rostov", "Kharkov", 2, "green", 0, false],
  ["Rostov", "Sochi", 2, "gray", 0, false],
  ["Sochi", "Erzurum", 3, "red", 0, false],
  ["Erzurum", "Angora", 3, "black", 0, false],
  ["Angora", "Smyrna", 3, "orange", 0, true],
];

// Parallel routes share a `group`; claiming one of a pair blocks the other in some player counts.
function buildRoutes() {
  const counts: Record<string, number> = {};
  return ROUTE_SPECS.map(([from, to, length, color, locos, tunnel]) => {
    const pair = [from, to].sort().join("|");
    counts[pair] = (counts[pair] ?? 0) + 1;
    return {
      id: `${pair}#${counts[pair]}`,
      from,
      to,
      length,
      color,
      locos,
      tunnel,
      group: pair,
    };
  });
}

export const ROUTES = buildRoutes();
export type RouteData = (typeof ROUTES)[number];
