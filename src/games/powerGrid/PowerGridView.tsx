import { useState } from "react";
import { GameRecord } from "../../types";
import { GameViewProps } from "../types";
import { BOARD_HEIGHT, BOARD_WIDTH, CITIES, cityName, EDGES } from "./map/map";
import { plantCapacity, plantData } from "./plants";
import {
  buildCost,
  endCities,
  housesAllowed,
  LIMITS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ownedCities,
  payout,
  resourceCost,
  unitPrice,
} from "./rules";
import { Phase, PowerGridAction, PowerGridState, RESOURCES, Resource } from "./types";

const COLORS = ["#2b6cb0", "#c53030", "#2f855a", "#b7791f"];

const PHASE_NAMES: Record<Phase, string> = {
  auction: "Auction",
  resources: "Resources",
  build: "Building",
  bureaucracy: "Bureaucracy",
};

const RESOURCE_CAP: Record<Resource, number> = { coal: 24, oil: 24, garbage: 24, uranium: 12 };

function plantLine(n: number): string {
  const d = plantData(n);
  const cities = `${d.cities} ${d.cities === 1 ? "city" : "cities"}`;
  return d.kind === "eco" ? `#${n} eco, ${cities}` : `#${n} ${d.kind}, ${cities}, ${d.inputs} fuel`;
}

export function PowerGridView({ game: rawGame, playerId, onAction }: GameViewProps) {
  // The registry stores every game's state as unknown; this game's reducer owns the shape.
  const game = rawGame as GameRecord<PowerGridState>;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bidText, setBidText] = useState("");
  const [buyUnits, setBuyUnits] = useState<Record<number, number>>({});
  const [buildPick, setBuildPick] = useState("");
  const [runPick, setRunPick] = useState<number[]>([]);

  async function send(action: PowerGridAction) {
    setBusy(true);
    setError(null);
    try {
      await onAction(action);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const colorOf = (pid: string) => COLORS[game.players.findIndex((p) => p.id === pid) % COLORS.length];
  const nameOf = (pid: string) => game.players.find((p) => p.id === pid)?.name ?? pid;

  if (game.status === "waiting" || !game.state) {
    const isHost = playerId === game.createdBy;
    return (
      <section className="panel" style={{ maxWidth: 520 }}>
        <h2>Power Grid</h2>
        <p className="muted">
          {MIN_PLAYERS} to {MAX_PLAYERS} players. Waiting for the host to start.
        </p>
        <ul>
          {game.players.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
        {isHost && (
          <button
            className="btn btn-primary"
            disabled={busy || game.players.length < MIN_PLAYERS}
            onClick={() => send({ type: "start" })}
          >
            Start game
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const s = game.state;
  const me = playerId;
  const myTurn = s.current === me && game.status === "started";
  const myMoney = s.money[me] ?? 0;
  const myOwned = s.plants[me] ?? [];
  const myCities = ownedCities(s, me);

  const bidDue = s.auction !== null && s.auction.active[s.auction.turn] === me;
  const canNominate = myTurn && s.phase === "auction" && s.auction === null;
  const canBuildHere = (cityId: string) =>
    myTurn &&
    s.phase === "build" &&
    !(s.houses[cityId] ?? []).includes(me) &&
    (s.houses[cityId] ?? []).length < housesAllowed(s.step) &&
    myCities.length < LIMITS.MAX_CITIES &&
    buildCost(s, me, cityId) <= myMoney;

  const buildOptions = CITIES.filter((c) => canBuildHere(c.id))
    .map((c) => ({ id: c.id, cost: buildCost(s, me, c.id) }))
    .sort((a, b) => a.cost - b.cost);
  const pick = buildPick && buildOptions.some((o) => o.id === buildPick) ? buildPick : buildOptions[0]?.id ?? "";

  const runnable = myOwned.filter((op) => op.stored >= plantData(op.number).inputs).map((op) => op.number);
  const runSelected = runPick.filter((n) => runnable.includes(n));
  const runCities = runSelected.reduce((sum, n) => sum + plantData(n).cities, 0);

  const phaseLine = game.status === "finished" ? "Game over" : `${PHASE_NAMES[s.phase]} phase`;
  const turnLine =
    game.status === "finished"
      ? ""
      : myTurn
        ? "Your turn"
        : s.auction
          ? `Bidding: ${nameOf(s.auction.active[s.auction.turn] ?? "")}`
          : s.current
            ? `Waiting for ${nameOf(s.current)}`
            : "";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "2 1 520px", minWidth: 0 }}>
        <section className="panel">
          <h2 style={{ margin: "0 0 6px" }}>Power Grid: Northmarch</h2>
          <p className="muted" style={{ margin: 0 }}>
            Round {s.round} · {phaseLine} · Step {s.step}
            {turnLine && <strong style={{ marginLeft: 8, color: "var(--text, inherit)" }}>{turnLine}</strong>}
          </p>
          <svg
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            style={{ width: "100%", height: "auto", marginTop: 8 }}
            role="img"
            aria-label="Map of Northmarch"
          >
            {EDGES.map((e) => {
              const a = CITIES.find((c) => c.id === e.from)!;
              const b = CITIES.find((c) => c.id === e.to)!;
              return (
                <g key={`${e.from}-${e.to}`}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9a9a9a" strokeWidth={3} />
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2}
                    fontSize={16}
                    textAnchor="middle"
                    fill="#555"
                    stroke="#fff"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    {e.cost}
                  </text>
                </g>
              );
            })}
            {CITIES.map((c) => {
              const houses = s.houses[c.id] ?? [];
              const clickable = canBuildHere(c.id);
              return (
                <g
                  key={c.id}
                  onClick={clickable ? () => send({ type: "buildCity", city: c.id }) : undefined}
                  style={{ cursor: clickable ? "pointer" : "default" }}
                >
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={clickable ? 22 : 18}
                    fill="#fff"
                    stroke={clickable ? "#2b6cb0" : "#333"}
                    strokeWidth={clickable ? 4 : 2}
                  />
                  {houses.map((pid, i) => (
                    <circle
                      key={pid}
                      cx={c.x + (i - (houses.length - 1) / 2) * 14}
                      cy={c.y + 4}
                      r={6}
                      fill={colorOf(pid)}
                    />
                  ))}
                  <text x={c.x} y={c.y - 28} fontSize={16} textAnchor="middle" fill="#222" fontWeight={600}>
                    {c.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {s.order.map((pid) => (
              <span key={pid} style={{ marginRight: 12, whiteSpace: "nowrap" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: colorOf(pid),
                    marginRight: 4,
                  }}
                />
                {nameOf(pid)}
              </span>
            ))}
            · Numbers on the lines are connection costs.
          </div>
        </section>

        <section className="panel" style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 8px" }}>Players</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Player</th>
                  <th>Money</th>
                  <th>Cities</th>
                  <th>Plants</th>
                </tr>
              </thead>
              <tbody>
                {s.order.map((pid) => (
                  <tr key={pid} style={{ borderTop: "1px solid #ddd" }}>
                    <td>
                      <span style={{ color: colorOf(pid), fontWeight: 700 }}>●</span> {nameOf(pid)}
                      {pid === me && " (you)"}
                    </td>
                    <td>{s.money[pid]}</td>
                    <td>{ownedCities(s, pid).length}</td>
                    <td>
                      {(s.plants[pid] ?? []).length === 0 && <span className="muted">none</span>}
                      {(s.plants[pid] ?? []).map((op) => {
                        const d = plantData(op.number);
                        return (
                          <div key={op.number}>
                            {plantLine(op.number)}
                            {d.inputs > 0 && (
                              <span className="muted">
                                {" "}· {op.stored}/{plantCapacity(d)} stored
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}

        {game.status === "finished" && s.results && (
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Final scores</h3>
            <p>
              Winner: <strong>{s.results.winners.map(nameOf).join(" and ")}</strong>
            </p>
            <table style={{ width: "100%", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Player</th>
                  <th>Can power</th>
                  <th>Money</th>
                </tr>
              </thead>
              <tbody>
                {s.results.scores.map((sc) => (
                  <tr key={sc.id}>
                    <td>{nameOf(sc.id)}</td>
                    <td>{sc.capacity}</td>
                    <td>{sc.money}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {game.status !== "finished" && (
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Your move</h3>
            <p className="muted" style={{ margin: "0 0 8px" }}>
              You have {myMoney} Elektro and {myCities.length} {myCities.length === 1 ? "city" : "cities"}.
            </p>

            {s.phase === "auction" && s.auction && (
              <div>
                <p style={{ margin: "0 0 6px" }}>
                  Plant <strong>{s.auction.plant}</strong> · high bid{" "}
                  <strong>{s.auction.price}</strong> by {nameOf(s.auction.leader)}
                </p>
                {bidDue ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min={s.auction.price + 1}
                      max={myMoney}
                      value={bidText}
                      placeholder={`${s.auction.price + 1}+`}
                      onChange={(e) => setBidText(e.target.value)}
                      style={{ width: 90 }}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={busy || !bidText}
                      onClick={() => send({ type: "bid", amount: Number(bidText) })}
                    >
                      Bid
                    </button>
                    <button
                      className="btn"
                      disabled={busy || s.auction.leader === me}
                      onClick={() => send({ type: "fold" })}
                    >
                      Drop out
                    </button>
                  </div>
                ) : (
                  <p className="muted">Waiting for the bidding to reach you.</p>
                )}
              </div>
            )}

            {canNominate && (
              <div>
                <p className="muted" style={{ margin: "0 0 6px" }}>
                  Pick a plant to auction, or pass for this round.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...s.market.current].sort((a, b) => a - b).map((n) => (
                    <button
                      key={n}
                      className="btn"
                      disabled={busy || myMoney < n || myOwned.length >= LIMITS.MAX_PLANTS}
                      onClick={() => send({ type: "nominate", plant: n })}
                      style={{ textAlign: "left" }}
                    >
                      Auction {plantLine(n)}
                    </button>
                  ))}
                </div>
                <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={() => send({ type: "pass" })}>
                  Pass
                </button>
              </div>
            )}

            {myTurn && s.phase === "resources" && (
              <div>
                <p className="muted" style={{ margin: "0 0 6px" }}>
                  Buy fuel for your plants. Units are charged from the cheapest price first.
                </p>
                {myOwned.filter((op) => plantData(op.number).kind !== "eco").length === 0 && (
                  <p className="muted">You have no fuel plants.</p>
                )}
                {myOwned
                  .filter((op) => plantData(op.number).kind !== "eco")
                  .map((op) => {
                    const d = plantData(op.number);
                    const res = d.kind as Resource;
                    const room = plantCapacity(d) - op.stored;
                    const units = Math.min(buyUnits[op.number] ?? 1, room, s.resources[res]);
                    const cost = units > 0 ? resourceCost(s, res, units) : 0;
                    return (
                      <div key={op.number} style={{ marginBottom: 8 }}>
                        <div>{plantLine(op.number)} · {op.stored}/{plantCapacity(d)} stored</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            type="number"
                            min={1}
                            max={room}
                            value={buyUnits[op.number] ?? 1}
                            onChange={(e) =>
                              setBuyUnits({ ...buyUnits, [op.number]: Number(e.target.value) })
                            }
                            style={{ width: 70 }}
                          />
                          <button
                            className="btn"
                            disabled={busy || room <= 0 || units < 1 || cost > myMoney}
                            onClick={() => send({ type: "buyResource", plant: op.number, units })}
                          >
                            Buy {units} {res} for {cost}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                <button className="btn btn-primary" disabled={busy} onClick={() => send({ type: "doneResources" })}>
                  Done buying
                </button>
              </div>
            )}

            {myTurn && s.phase === "build" && (
              <div>
                <p className="muted" style={{ margin: "0 0 6px" }}>
                  Click a city on the map, or choose one here. Cost is shown for each.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select value={pick} onChange={(e) => setBuildPick(e.target.value)} disabled={buildOptions.length === 0}>
                    {buildOptions.length === 0 && <option value="">Nothing you can afford</option>}
                    {buildOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {cityName(o.id)} ({o.cost})
                      </option>
                    ))}
                  </select>
                  <button className="btn" disabled={busy || !pick} onClick={() => send({ type: "buildCity", city: pick })}>
                    Build
                  </button>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => send({ type: "doneBuild" })}>
                  Done building
                </button>
              </div>
            )}

            {myTurn && s.phase === "bureaucracy" && (
              <div>
                <p className="muted" style={{ margin: "0 0 6px" }}>
                  Choose the plants to run. Each uses its fuel. Income depends on the cities powered.
                </p>
                {myOwned.length === 0 && <p className="muted">No plants to run.</p>}
                {myOwned.map((op) => {
                  const ok = runnable.includes(op.number);
                  return (
                    <label key={op.number} style={{ display: "block", opacity: ok ? 1 : 0.5 }}>
                      <input
                        type="checkbox"
                        disabled={!ok}
                        checked={runSelected.includes(op.number)}
                        onChange={(e) =>
                          setRunPick(
                            e.target.checked
                              ? [...runSelected, op.number]
                              : runSelected.filter((n) => n !== op.number),
                          )
                        }
                      />{" "}
                      {plantLine(op.number)}
                      {!ok && " (not enough fuel)"}
                    </label>
                  );
                })}
                <p style={{ margin: "8px 0" }}>
                  Powers {Math.min(runCities, myCities.length)} of {myCities.length} cities: earn{" "}
                  <strong>{payout(Math.min(runCities, myCities.length))}</strong>
                </p>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => {
                    send({ type: "power", plants: runSelected });
                    setRunPick([]);
                  }}
                >
                  Run plants
                </button>
              </div>
            )}

            {!myTurn && !bidDue && (
              <p className="muted" style={{ margin: 0 }}>
                {s.current ? `Waiting for ${nameOf(s.current)}.` : "Waiting."}
              </p>
            )}
          </section>
        )}

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Resource market</h3>
          <table style={{ width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>Resource</th>
                <th>Stock</th>
                <th>Next unit</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((r) => (
                <tr key={r}>
                  <td style={{ textTransform: "capitalize" }}>{r}</td>
                  <td>
                    {s.resources[r]}/{RESOURCE_CAP[r]}
                  </td>
                  <td>{s.resources[r] > 0 ? unitPrice(r, s.resources[r]) : "sold out"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Log</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, maxHeight: 260, overflowY: "auto" }}>
            {[...s.log].reverse().map((entry, i) => (
              <li key={i}>{entry.text}</li>
            ))}
          </ul>
        </section>

        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Game ends when a player reaches {endCities(s.order.length)} cities. Up to {MAX_PLAYERS} players.
        </p>
      </div>
    </div>
  );
}
