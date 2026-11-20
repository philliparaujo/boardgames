// Power Grid: "Northmarch" map. A fictional region, not the official board.
// Positions are in board pixels (BOARD_WIDTH x BOARD_HEIGHT). Connection costs are
// the Elektro needed to link two neighbouring cities. Consistency checks live in rules.test.ts.

export interface CityData {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface EdgeData {
  from: string;
  to: string;
  cost: number;
}

export const BOARD_WIDTH = 1200;
export const BOARD_HEIGHT = 800;

export const CITIES: CityData[] = [
  { id: "northwick", name: "Northwick", x: 170, y: 90 },
  { id: "harrowgate", name: "Harrowgate", x: 380, y: 80 },
  { id: "vellmouth", name: "Vellmouth", x: 600, y: 70 },
  { id: "thornby", name: "Thornby", x: 820, y: 100 },
  { id: "greyhaven", name: "Greyhaven", x: 1020, y: 120 },
  { id: "ostrel", name: "Ostrel", x: 260, y: 230 },
  { id: "kestel", name: "Kestel", x: 480, y: 230 },
  { id: "marrow", name: "Marrow", x: 700, y: 230 },
  { id: "brannock", name: "Brannock", x: 900, y: 260 },
  { id: "lindmere", name: "Lindmere", x: 120, y: 380 },
  { id: "stonebridge", name: "Stonebridge", x: 340, y: 390 },
  { id: "ferrow", name: "Ferrow", x: 560, y: 380 },
  { id: "coldwater", name: "Coldwater", x: 780, y: 390 },
  { id: "ashford", name: "Ashford", x: 1040, y: 400 },
  { id: "dunmarsh", name: "Dunmarsh", x: 200, y: 540 },
  { id: "oldquay", name: "Old Quay", x: 420, y: 540 },
  { id: "tealbay", name: "Teal Bay", x: 640, y: 530 },
  { id: "halden", name: "Halden", x: 860, y: 540 },
  { id: "pellham", name: "Pellham", x: 1060, y: 560 },
  { id: "corvo", name: "Corvo", x: 300, y: 690 },
  { id: "sorrel", name: "Sorrel", x: 520, y: 690 },
  { id: "tarrant", name: "Tarrant", x: 740, y: 690 },
  { id: "westfen", name: "Westfen", x: 940, y: 700 },
];

export const EDGES: EdgeData[] = [
  { from: "northwick", to: "harrowgate", cost: 3 },
  { from: "harrowgate", to: "vellmouth", cost: 4 },
  { from: "vellmouth", to: "thornby", cost: 4 },
  { from: "thornby", to: "greyhaven", cost: 5 },
  { from: "northwick", to: "ostrel", cost: 3 },
  { from: "harrowgate", to: "ostrel", cost: 4 },
  { from: "harrowgate", to: "kestel", cost: 3 },
  { from: "vellmouth", to: "kestel", cost: 4 },
  { from: "vellmouth", to: "marrow", cost: 4 },
  { from: "thornby", to: "marrow", cost: 5 },
  { from: "thornby", to: "brannock", cost: 5 },
  { from: "greyhaven", to: "brannock", cost: 4 },
  { from: "ostrel", to: "lindmere", cost: 4 },
  { from: "ostrel", to: "stonebridge", cost: 3 },
  { from: "kestel", to: "stonebridge", cost: 4 },
  { from: "kestel", to: "ferrow", cost: 3 },
  { from: "marrow", to: "ferrow", cost: 4 },
  { from: "marrow", to: "coldwater", cost: 4 },
  { from: "brannock", to: "coldwater", cost: 5 },
  { from: "brannock", to: "ashford", cost: 4 },
  { from: "lindmere", to: "dunmarsh", cost: 3 },
  { from: "stonebridge", to: "dunmarsh", cost: 4 },
  { from: "stonebridge", to: "oldquay", cost: 3 },
  { from: "ferrow", to: "oldquay", cost: 4 },
  { from: "ferrow", to: "tealbay", cost: 5 },
  { from: "coldwater", to: "halden", cost: 4 },
  { from: "ashford", to: "pellham", cost: 3 },
  { from: "ashford", to: "halden", cost: 5 },
  { from: "dunmarsh", to: "corvo", cost: 4 },
  { from: "oldquay", to: "corvo", cost: 4 },
  { from: "oldquay", to: "sorrel", cost: 4 },
  { from: "tealbay", to: "sorrel", cost: 4 },
  { from: "tealbay", to: "tarrant", cost: 4 },
  { from: "halden", to: "tarrant", cost: 4 },
  { from: "pellham", to: "westfen", cost: 4 },
  { from: "pellham", to: "halden", cost: 3 },
  { from: "tarrant", to: "westfen", cost: 5 },
  { from: "corvo", to: "sorrel", cost: 4 },
  { from: "sorrel", to: "tarrant", cost: 5 },
];

export function cityName(id: string): string {
  return CITIES.find((c) => c.id === id)?.name ?? id;
}
