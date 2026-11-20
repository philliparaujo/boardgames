import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { createGame, deleteGame, isStale, joinGame, listGames } from "../api/games";
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
  const [choice, setChoice] = useState<string | null>(null);
  const chosen = PLAYABLE.find((def) => def.type === choice) ?? PLAYABLE[0] ?? null;
  const [busy, setBusy] = useState(false);

  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setGames(await listGames({ includeStale: true }));
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

  const remove = (g: GameRecord) => {
    const others = g.players.filter((p) => p.id !== me.id).length;
    const warning =
      g.status === "started" && others > 0
        ? "\n\nThis game is in progress; the other players will lose it too."
        : "";
    if (!window.confirm(`Delete this ${title(g)} game for everyone?${warning}`)) return;
    run(async () => {
      await deleteGame(g.id);
      setGames((list) => list.filter((x) => x.id !== g.id));
    });
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(me.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Your player ID:", me.id);
    }
  };

  const isMine = (g: GameRecord) => g.players.some((p) => p.id === me.id);
  const mine = games.filter(isMine);
  const open = games.filter(
    (g) => g.status === "waiting" && !isMine(g) && g.players.length < g.maxPlayers && !isStale(g),
  );
  const other = games.filter((g) => !isMine(g) && !open.includes(g));

  const title = (g: GameRecord) => getGameDefinition(g.gameType)?.title ?? g.gameType;
  const players = (g: GameRecord) => (
    <span className="player-list">
      {g.players.map((p) => (
        <span key={p.id}>
          {p.name} <code className="player-id">{p.id}</code>
        </span>
      ))}
    </span>
  );
  const deleteButton = (g: GameRecord) => (
    <button
      className="btn btn-small btn-danger"
      disabled={busy}
      onClick={() => remove(g)}
      title="Delete this game for everyone"
    >
      Delete
    </button>
  );
  const age = (g: GameRecord) => timeAgo(g.updatedAt ?? g.createdAt);

  return (
    <main>
      <header className="lobby-header">
        <Brand tag="Departures board" />
        <div className="lobby-user">
          <span>
            Signed in as <span className="lobby-user-name">{me.name}</span>{" "}
            <code className="player-id" title="Use this ID on the home page to get back into your games">
              {me.id}
            </code>
          </span>
          <button className="btn btn-small" onClick={copyId} title="Copy your player ID">
            {copied ? "Copied!" : "Copy ID"}
          </button>
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
          {chosen && (
            <>
              <div className="game-picker" role="radiogroup" aria-label="Game to start">
                {PLAYABLE.map((def) => (
                  <button
                    key={def.type}
                    type="button"
                    role="radio"
                    aria-checked={def.type === chosen.type}
                    className={`game-choice${def.type === chosen.type ? " game-choice-on" : ""}`}
                    onClick={() => setChoice(def.type)}
                  >
                    <span className="game-choice-title">{def.title}</span>
                    <small>{def.minPlayers}–{def.maxPlayers} players</small>
                    {def.summary && <span className="game-choice-summary">{def.summary}</span>}
                  </button>
                ))}
              </div>
              {(() => {
                const def = chosen;
                const size = sizes[def.type] ?? def.maxPlayers;
                const options: number[] = [];
                for (let n = def.minPlayers; n <= def.maxPlayers; n++) options.push(n);
                return (
                  <div className="game-type">
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
                      Create {def.title}
                    </button>
                  </div>
                );
              })()}
            </>
          )}
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
                      {g.players.length}/{g.maxPlayers} players · {age(g)}
                      {players(g)}
                    </span>
                  </span>
                  <span className={`pill pill-${g.status}`}>{STATUS_LABEL[g.status] ?? g.status}</span>
                  <Link className="btn btn-small" to={gamePath(g.id)}>
                    Open
                  </Link>
                  {deleteButton(g)}
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
                  {g.players.length}/{g.maxPlayers} players · {age(g)}
                  {players(g)}
                </span>
              </span>
              <button className="btn btn-primary btn-small" disabled={busy} onClick={() => join(g.id)}>
                Join
              </button>
              {deleteButton(g)}
            </li>
          ))}
        </ul>
      </section>

      {other.length > 0 && (
        <section className="panel lobby-wide">
          <details className="lobby-other">
            <summary>Other games ({other.length})</summary>
            <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
              Games you're not in: in progress, finished, full, or idle for over a day. Open one to
              rejoin with "Rejoin as", or delete the ones nobody needs.
            </p>
            <ul className="game-list">
              {other.map((g) => (
                <li key={g.id}>
                  <span className="game-list-title">
                    {title(g)}
                    <span className="game-list-meta">
                      {g.players.length}/{g.maxPlayers} players · {age(g)}
                      {players(g)}
                    </span>
                  </span>
                  <span className={`pill pill-${g.status}`}>
                    {isStale(g) ? "Idle" : STATUS_LABEL[g.status] ?? g.status}
                  </span>
                  <Link className="btn btn-small" to={gamePath(g.id)}>
                    Open
                  </Link>
                  {deleteButton(g)}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </main>
  );
}

// "5 min ago", "3 h ago", "2 d ago": when the game last changed.
function timeAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return "active just now";
  if (minutes < 60) return `active ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `active ${hours} h ago`;
  return `active ${Math.floor(hours / 24)} d ago`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default Lobby;
