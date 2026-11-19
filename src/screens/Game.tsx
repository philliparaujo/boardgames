import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { dispatchAction, joinGame, leaveGame, newerGame, subscribeGame } from "../api/games";
import { getGameDefinition } from "../games/registry";
import { GamePlayer, GameRecord } from "../types";
import { getPlayer, takeSeat } from "../utils/identity";
import { HOME_PATH, LOBBY_PATH } from "../utils/navigation";

function Game() {
  const { gameId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<GamePlayer | null>(getPlayer);
  // The game from the server listener. undefined = still loading, null = not found.
  const [serverGame, setServerGame] = useState<GameRecord | null | undefined>(undefined);
  // This client's latest write (predicted, then confirmed). Shown until the listener
  // catches up, so your own moves appear without waiting for the round trip.
  const [ownWrite, setOwnWrite] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    if (!gameId) return;
    setServerGame(undefined);
    setOwnWrite(null);
    return subscribeGame(gameId, setServerGame, (err) => setError(err.message));
  }, [gameId]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const game = serverGame ? newerGame(serverGame, ownWrite) : serverGame;

  // If you're already in the game but changed your display name, sync it once.
  // (Two tabs sharing an id but with different names would otherwise overwrite
  // each other forever.)
  const isMember = !!player && !!game?.players.some((p) => p.id === player.id);
  const memberName = game?.players.find((p) => p.id === player?.id)?.name;
  const syncedName = useRef<string | null>(null);
  useEffect(() => {
    if (!gameId || !player || !isMember || memberName === player.name) return;
    const key = `${gameId}:${player.id}:${player.name}`;
    if (syncedName.current === key) return;
    syncedName.current = key;
    joinGame(gameId, player).catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, isMember, memberName, player?.id, player?.name]);

  if (!player) return <Navigate to={HOME_PATH} replace state={{ from: location.pathname }} />;
  if (!gameId) return <Navigate to={LOBBY_PATH} replace />;
  if (game === undefined) {
    return <main>{error ? <p role="alert">{error}</p> : "Loading game..."}</main>;
  }
  if (game === null) {
    return (
      <main>
        <p>Game not found.</p>
        <Link to={LOBBY_PATH}>Back to lobby</Link>
      </main>
    );
  }

  const definition = getGameDefinition(game.gameType);
  if (!definition) {
    return (
      <main>
        <p>Unknown game type: {game.gameType}</p>
        <Link to={LOBBY_PATH}>Back to lobby</Link>
      </main>
    );
  }

  const isFull = game.players.length >= game.maxPlayers;
  const canJoin = !isMember && !isFull && game.status === "waiting";
  // A new tab is a new player (identity is per tab), so offer a way back into a seat.
  // Also covers a host who lost their tab before starting the game.
  const canRejoin = !isMember && game.players.length > 0;
  const status =
    game.status === "waiting"
      ? "Waiting for players"
      : game.status === "started"
        ? "In progress"
        : "Finished";

  // Shows the predicted result immediately; rolls it back if the write fails.
  const onAction = async (action: unknown) => {
    let predicted: GameRecord | null = null;
    try {
      const written = await dispatchAction(gameId, action, player.id, {
        base: game,
        onPredicted: (g) => {
          predicted = g;
          setOwnWrite(g);
        },
      });
      setOwnWrite((prev) => (prev === predicted || !prev ? written : newerGame(prev, written)));
    } catch (err) {
      setOwnWrite((prev) => (prev === predicted ? null : prev));
      throw err;
    }
  };

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const join = () => run(() => joinGame(gameId, player));

  const leave = () =>
    run(async () => {
      await leaveGame(gameId, player.id);
      navigate(LOBBY_PATH);
    });

  const rejoinAs = (seat: GamePlayer) => {
    if (!window.confirm(`Play as ${seat.name}? Only do this if it's your seat.`)) return;
    setError(null);
    setPlayer(takeSeat(seat));
  };

  return (
    <main className="game-page">
      <header className="game-header">
        <Link to={LOBBY_PATH}>← Lobby</Link>
        <h2>{definition.title}</h2>
        <span className="game-header-meta">
          {game.players.length}/{game.maxPlayers} players · {status} ·{" "}
          {isMember ? "You're in this game" : isFull ? "Full" : "Not joined"}
        </span>
        {canJoin && <button onClick={join}>Join game</button>}
        {isMember && game.status === "waiting" && <button onClick={leave}>Leave game</button>}
        {canRejoin && (
          <span className="game-header-rejoin">
            Lost your seat? Rejoin as{" "}
            {game.players.map((p) => (
              <button key={p.id} onClick={() => rejoinAs(p)}>
                {p.name}
              </button>
            ))}
          </span>
        )}
        {!online && <span role="status">Offline, reconnecting...</span>}
        {error && <span role="alert">{error}</span>}
      </header>
      <div className="game-body">
        <definition.Component game={game} playerId={player.id} onAction={onAction} />
      </div>
    </main>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default Game;
