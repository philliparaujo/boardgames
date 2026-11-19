import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { createGame, joinGame, listGames } from "../api/games";
import { GAME_DEFINITIONS, getGameDefinition } from "../games/registry";
import { GameRecord, GamePlayer } from "../types";
import { getPlayer, logout } from "../utils/identity";
import { gamePath, HOME_PATH } from "../utils/navigation";
import { Brand } from "./Home";

// Only games with a reducer can actually be played; the rest are placeholders.
const PLAYABLE = GAME_DEFINITIONS.filter((def) => def.reduce);

const STATUS_LABEL: Record<GameRecord["status"], string> = {
  waiting: "Waiting for players",
  started: "In progress",
  finished: "Finished",
};

function Lobby() {
  const navigate = useNavigate();
  const player = getPlayer();

  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setGames(await listGames());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!player) return <Navigate to={HOME_PATH} replace />;
  const me: GamePlayer = player;

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const create = (gameType: string) =>
    run(async () => {
      const definition = getGameDefinition(gameType);
      if (!definition) return;
      const maxPlayers = sizes[gameType] ?? definition.maxPlayers;
      const id = await createGame(gameType, maxPlayers, me);
      navigate(gamePath(id));
    });

  const join = (gameId: string) =>
    run(async () => {
      await joinGame(gameId, me);
      navigate(gamePath(gameId));
    });

  const mine = games.filter((g) => g.players.some((p) => p.id === me.id));
  const open = games.filter(
    (g) =>
      g.status === "waiting" &&
      !g.players.some((p) => p.id === me.id) &&
      g.players.length < g.maxPlayers,
  );

  const title = (g: GameRecord) => getGameDefinition(g.gameType)?.title ?? g.gameType;
  const playerNames = (g: GameRecord) => g.players.map((p) => p.name).join(", ");

  return (
    <main>
      <header className="lobby-header">
        <Brand tag="Departures board" />
        <div className="lobby-user">
          <span>
            Signed in as <span className="lobby-user-name">{me.name}</span>
          </span>
          <button
            className="btn btn-small"
            onClick={() => {
              logout();
              navigate(HOME_PATH);
            }}
          >
            Log out
          </button>
        </div>
      </header>

      {error && <p role="alert">{error}</p>}

      <div className="lobby-grid">
        <section className="panel" aria-labelledby="create-heading">
          <h2 id="create-heading">Start a new game</h2>
          {PLAYABLE.length === 0 && <p className="muted">No games are available yet.</p>}
          {PLAYABLE.map((def) => {
            const size = sizes[def.type] ?? def.maxPlayers;
            const options: number[] = [];
            for (let n = def.minPlayers; n <= def.maxPlayers; n++) options.push(n);
            return (
              <div key={def.type} className="game-type">
                <span className="game-type-title">
                  {def.title}
                  <small>
                    {def.minPlayers}–{def.maxPlayers} players
                  </small>
                </span>
                <label className="muted" style={{ fontSize: 14 }}>
                  Seats{" "}
                  <select
                    className="field"
                    style={{ minHeight: 34, padding: "3px 6px" }}
                    value={size}
                    onChange={(e) => setSizes({ ...sizes, [def.type]: Number(e.target.value) })}
                  >
                    {options.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-primary" disabled={busy} onClick={() => create(def.type)}>
                  Create
                </button>
              </div>
            );
          })}
        </section>

        <section className="panel" aria-labelledby="mine-heading">
          <h2 id="mine-heading">Your games</h2>
          {loading && mine.length === 0 ? (
            <p className="muted">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="muted">You're not in any games yet. Create one or join an open game.</p>
          ) : (
            <ul className="game-list">
              {mine.map((g) => (
                <li key={g.id}>
                  <span className="game-list-title">
                    {title(g)}
                    <span className="game-list-meta">
                      {g.players.length}/{g.maxPlayers} players · {playerNames(g)}
                    </span>
                  </span>
                  <span className={`pill pill-${g.status}`}>{STATUS_LABEL[g.status] ?? g.status}</span>
                  <Link className="btn btn-small" to={gamePath(g.id)}>
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel lobby-wide" aria-labelledby="open-heading">
        <div className="panel-head">
          <h2 id="open-heading">Open games</h2>
          <button className="btn btn-small" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
        {!loading && open.length === 0 && (
          <p className="muted">No open games right now. Start one and share its link.</p>
        )}
        <ul className="game-list">
          {open.map((g) => (
            <li key={g.id}>
              <span className="game-list-title">
                {title(g)}
                <span className="game-list-meta">
                  {g.players.length}/{g.maxPlayers} players · {playerNames(g)}
                </span>
              </span>
              <button className="btn btn-primary btn-small" disabled={busy} onClick={() => join(g.id)}>
                Join
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default Lobby;
