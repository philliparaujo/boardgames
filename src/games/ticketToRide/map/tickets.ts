// Destination tickets for the Europe map, from the official card list.
// Long route tickets are only dealt at setup. Regular tickets form the draw pile.

import { Ticket } from "../types";

// [from, to, points]
const LONG_SPECS: [string, string, number][] = [
  ["Brest", "Petrograd", 20],
  ["Cadiz", "Stockholm", 21],
  ["Edinburgh", "Athina", 21],
  ["Kobenhavn", "Erzurum", 21],
  ["Lisboa", "Danzig", 20],
  ["Palermo", "Moskva", 20],
];

// [from, to, points]
const REGULAR_SPECS: [string, string, number][] = [
  ["Amsterdam", "Pamplona", 7],
  ["Amsterdam", "Wilno", 12],
  ["Angora", "Kharkov", 10],
  ["Athina", "Angora", 5],
  ["Athina", "Wilno", 11],
  ["Barcelona", "Bruxelles", 8],
  ["Barcelona", "Munchen", 8],
  ["Berlin", "Bucuresti", 8],
  ["Berlin", "Moskva", 12],
  ["Berlin", "Roma", 9],
  ["Brest", "Marseille", 7],
  ["Brest", "Venezia", 8],
  ["Bruxelles", "Danzig", 9],
  ["Budapest", "Sofia", 5],
  ["Edinburgh", "Paris", 7],
  ["Essen", "Kyiv", 10],
  ["Frankfurt", "Kobenhavn", 5],
  ["Frankfurt", "Smolensk", 13],
  ["Kyiv", "Petrograd", 6],
  ["Kyiv", "Sochi", 8],
  ["London", "Berlin", 7],
  ["London", "Wien", 10],
  ["Madrid", "Dieppe", 8],
  ["Madrid", "Zurich", 8],
  ["Marseille", "Essen", 8],
  ["Palermo", "Constantinople", 8],
  ["Paris", "Wien", 8],
  ["Paris", "Zagrab", 7],
  ["Riga", "Bucuresti", 10],
  ["Roma", "Smyrna", 8],
  ["Rostov", "Erzurum", 5],
  ["Sarajevo", "Sevastopol", 8],
  ["Smolensk", "Rostov", 8],
  ["Sofia", "Smyrna", 5],
  ["Stockholm", "Wien", 11],
  ["Venezia", "Constantinople", 10],
  ["Warszawa", "Smolensk", 6],
  ["Zagrab", "Brindisi", 6],
  ["Zurich", "Brindisi", 6],
  ["Zurich", "Budapest", 6],
];

// A ticket's id is its index in TICKETS.
export const TICKETS: Ticket[] = [...LONG_SPECS, ...REGULAR_SPECS].map(
  ([from, to, points], id) => ({
    id,
    from,
    to,
    points,
    long: id < LONG_SPECS.length,
  }),
);

export const LONG_TICKET_IDS = TICKETS.filter((t) => t.long).map((t) => t.id);
export const REGULAR_TICKET_IDS = TICKETS.filter((t) => !t.long).map((t) => t.id);
