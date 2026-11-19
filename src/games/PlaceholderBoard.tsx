import { GameRecord } from "../types";

// Shared placeholder in-game view: lists who is in the game and nothing else.
export function PlaceholderBoard({
  title,
  game,
}: {
  title: string;
  game: GameRecord;
}) {
  return (
    <section className="panel" style={{ maxWidth: 520 }}>
      <h2>{title}</h2>
      <p className="muted">This game isn't playable yet; it's a placeholder.</p>
      <h3 style={{ margin: "12px 0 6px", fontSize: 15 }}>
        Players ({game.players.length}/{game.maxPlayers})
      </h3>
      {game.players.length === 0 ? (
        <p className="muted">No players yet.</p>
      ) : (
        <ul>
          {game.players.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
