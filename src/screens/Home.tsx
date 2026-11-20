import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GAME_DEFINITIONS } from "../games/registry";
import { getPlayer, getStoredId, login, MAX_ID_LENGTH, playerIdError } from "../utils/identity";
import { LOBBY_PATH } from "../utils/navigation";

// Poster-style brand mark shared by Home and Lobby.
export function Brand({ tag }: { tag?: string }) {
  return (
    <div className="brand">
      <span className="brand-badge" aria-hidden="true">
        🚂
      </span>
      <div>
        <h1 className="brand-title">Boardgames</h1>
        {tag && <p className="brand-tag">{tag}</p>}
      </div>
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  // Where to go after login: the page that redirected here (e.g. a shared game link).
  const from = (location.state as { from?: unknown } | null)?.from;
  const next = typeof from === "string" && from.startsWith("/") ? from : LOBBY_PATH;
  const [name, setName] = useState(() => getPlayer()?.name ?? "");
  const [playerId, setPlayerId] = useState(() => getStoredId() ?? "");
  const idError = playerIdError(playerId.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || idError) return;
    login(trimmed, playerId);
    navigate(next);
  };

  return (
    <main className="home">
      <div className="home-ticket">
        <Brand tag="All aboard · Grand Tour of Europe" />
        <p className="home-intro">
          Turn-based board games with friends. Pick a name and head to the lobby to start or join a
          game.
        </p>
        {next !== LOBBY_PATH && (
          <p className="home-intro" style={{ color: "var(--burgundy)", fontWeight: 600 }}>
            Choose a name to join the game you were invited to.
          </p>
        )}
        <form className="home-form" onSubmit={submit}>
          <label htmlFor="home-name">Display name</label>
          <div className="home-form-row">
            <input
              id="home-name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder="e.g. Ada"
              autoComplete="nickname"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || !!idError}>
              Continue →
            </button>
          </div>
          <label htmlFor="home-id" style={{ marginTop: 12 }}>
            Player ID <span className="muted">(optional)</span>
          </label>
          <input
            id="home-id"
            className="field"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            maxLength={MAX_ID_LENGTH}
            placeholder="Leave blank for a new random ID"
            autoComplete="off"
            spellCheck={false}
          />
          {idError ? (
            <p role="alert" className="home-hint">
              {idError}
            </p>
          ) : (
            <p className="home-hint muted">
              Disconnected? Enter the ID you played with to get your seat back. Pick something
              memorable, like "ada-42", so you can reuse it.
            </p>
          )}
        </form>
        <div className="home-stub">
          <p className="home-foot">
            Now boarding:{" "}
            {GAME_DEFINITIONS.filter((d) => d.reduce)
              .map((d) => `${d.title} (${d.minPlayers}–${d.maxPlayers} players)`)
              .join(" · ")}
          </p>
        </div>
      </div>
    </main>
  );
}

export default Home;
