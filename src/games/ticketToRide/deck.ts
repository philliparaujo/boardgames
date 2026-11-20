import { CardColor, TRAIN_COLORS } from "./types";

// Display name of a card. Locomotives are called "rainbow" everywhere players see them.
export function cardLabel(c: CardColor): string {
  return c === "loco" ? "rainbow" : c;
}

// A payment as text, e.g. "3 red + 1 rainbow".
export function describeCards(cards: CardColor[]): string {
  const counts = new Map<CardColor, number>();
  for (const c of cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  // Colors first, rainbows last.
  const entries = Array.from(counts).sort(([a], [b]) => Number(a === "loco") - Number(b === "loco"));
  return entries.map(([c, n]) => `${n} ${cardLabel(c)}`).join(" + ") || "nothing";
}

// 12 cards per color plus 14 locomotives.
export function buildTrainDeck(): CardColor[] {
  const cards: CardColor[] = [];
  for (const color of TRAIN_COLORS) {
    for (let i = 0; i < 12; i++) cards.push(color);
  }
  for (let i = 0; i < 14; i++) cards.push("loco");
  return shuffle(cards);
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
