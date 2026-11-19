import { CardColor, TRAIN_COLORS } from "./types";

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
