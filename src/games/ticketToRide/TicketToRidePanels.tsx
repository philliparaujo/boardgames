// Side-panel pieces of the Ticket to Ride view: cards, ticket lists, players, results.
import { PointerEvent } from "react";
import { ROUTES } from "./map/europe";
import { TICKETS } from "./map/tickets";
import { cardLabel } from "./deck";
import { CARD_ORDER, countOf } from "./payment";
import * as scoring from "./scoring";
import { routePoints } from "./scoring";
import { PLAYER_COLORS, ROUTE_FILL } from "./TicketToRideBoard";
import { CardColor, TicketOffer, TTRState } from "./types";

export function cardBackground(c: CardColor): string {
  return c === "loco"
    ? "linear-gradient(135deg, #ef5350 0%, #ffb300 25%, #43a047 50%, #1e88e5 75%, #8e24aa 100%)"
    : ROUTE_FILL[c];
}

export function cardName(c: CardColor): string {
  const label = cardLabel(c);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function playerColor(state: TTRState, playerId: string): string {
  const i = state.order.indexOf(playerId);
  return i === -1 ? "#999" : PLAYER_COLORS[i % PLAYER_COLORS.length];
}

// A train card face: the card color with its name on a light label (readable on every color).
export function CardFace({
  card,
  count,
  size = "md",
}: {
  card: CardColor;
  count?: number;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`ttr-cardface ttr-cardface-${size}${card === "white" ? " ttr-cardface-white" : ""}`}
      style={{ background: cardBackground(card) }}
      title={count !== undefined ? `${count} ${cardName(card)}` : cardName(card)}
    >
      {count !== undefined && <span className="ttr-cardface-count">{count}</span>}
      <span className="ttr-cardface-name">{cardName(card)}</span>
    </span>
  );
}

// The player's hand: one card per color held, with a count badge.
export function Hand({ hand }: { hand: CardColor[] }) {
  if (hand.length === 0) return <p className="ttr-muted">No cards yet.</p>;
  return (
    <div className="ttr-hand" aria-label="Cards in hand">
      {CARD_ORDER.map((c) => {
        const n = countOf(hand, c);
        return n > 0 ? <CardFace key={c} card={c} count={n} size="sm" /> : null;
      })}
    </div>
  );
}

// A row of small card faces showing a payment.
export function PaymentPreview({ payment }: { payment: CardColor[] }) {
  return (
    <span className="ttr-pay">
      {CARD_ORDER.map((c) => {
        const n = countOf(payment, c);
        return n > 0 ? (
          <span key={c} className="ttr-pay-item">
            <span className="ttr-pay-swatch" style={{ background: cardBackground(c) }} />
            {n} {cardLabel(c)}
          </span>
        ) : null;
      })}
    </span>
  );
}

// Hover (mouse) or focus (keyboard) highlights a ticket's cities; a tap toggles it on touch.
export interface TicketHover {
  active: number | null;
  set: (id: number | null) => void;
}

function hoverProps(id: number, hover: TicketHover) {
  return {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover.set(id);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover.set(null);
    },
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType !== "mouse") hover.set(hover.active === id ? null : id);
    },
    onFocus: () => hover.set(id),
    onBlur: () => hover.set(null),
  };
}

// A player whose trains and stations are highlighted on the map.
export interface PlayerFocus {
  active: string | null;
  set: (playerId: string | null) => void;
}

// Hover (mouse), tap (touch) or keyboard focus highlights the player's pieces.
function focusProps(playerId: string, focus: PlayerFocus | undefined) {
  if (!focus) return {};
  return {
    tabIndex: 0,
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "mouse") focus.set(playerId);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === "mouse") focus.set(null);
    },
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType !== "mouse") focus.set(focus.active === playerId ? null : playerId);
    },
    onFocus: () => focus.set(playerId),
    onBlur: () => focus.set(null),
  };
}

function TicketLabel({ id, done }: { id: number; done?: boolean }) {
  const t = TICKETS[id];
  if (!t) return null;
  return (
    <>
      <span className="ttr-ticket-cities">
        {t.from} – {t.to}
      </span>
      <span className={`ttr-points${done ? " ttr-points-done" : ""}`}>{t.points}</span>
    </>
  );
}

export function TicketOfferPanel({
  offer,
  keepIds,
  onToggle,
  onKeep,
  busy,
  hover,
  className,
}: {
  offer: TicketOffer;
  keepIds: number[];
  onToggle: (id: number) => void;
  onKeep: () => void;
  busy: boolean;
  hover: TicketHover;
  className?: string;
}) {
  const short = keepIds.length < offer.min;
  return (
    <section className={`ttr-card ttr-offer ${className ?? ""}`} aria-label="Ticket choice">
      <h3>Choose your destination tickets</h3>
      <p className="ttr-note">
        Keep at least {offer.min}. Completed tickets score their points; unfinished ones are
        subtracted. Hover or tap a ticket to see it on the map.
      </p>
      <ul className="ttr-tickets">
        {offer.ids.map((id) => (
          <li
            key={id}
            className={`ttr-ticket${keepIds.includes(id) ? " ttr-ticket-kept" : ""}`}
            {...hoverProps(id, hover)}
          >
            <label>
              <input type="checkbox" checked={keepIds.includes(id)} onChange={() => onToggle(id)} />
              <TicketLabel id={id} />
            </label>
          </li>
        ))}
      </ul>
      <button className="ttr-btn ttr-btn-primary ttr-btn-block" disabled={busy || short} onClick={onKeep}>
        Keep {keepIds.length} ticket{keepIds.length === 1 ? "" : "s"}
      </button>
      {short && <p className="ttr-reason">Select at least {offer.min} to continue.</p>}
    </section>
  );
}

// Tickets the player has completed so far, counting routes their stations could borrow.
function completedTickets(state: TTRState, playerId: string): Set<number> {
  try {
    if (typeof scoring.scoreTickets === "function") {
      return new Set(scoring.scoreTickets(state, playerId)?.completedIds ?? []);
    }
  } catch {
    // Fall through to plain connectivity.
  }
  const owned = ROUTES.filter((r) => state.owners[r.id] === playerId);
  return new Set(
    (state.tickets[playerId] ?? []).filter((id) => {
      const t = TICKETS[id];
      return !!t && scoring.isConnected(owned, t.from, t.to);
    }),
  );
}

// The player's kept tickets, with completed ones checked off.
export function TicketList({
  state,
  playerId,
  hover,
}: {
  state: TTRState;
  playerId: string;
  hover: TicketHover;
}) {
  const ids = state.tickets[playerId] ?? [];
  if (ids.length === 0) return <p className="ttr-muted">No tickets yet.</p>;
  const completed = completedTickets(state, playerId);
  const done = (id: number) => completed.has(id);
  const sorted = [...ids].sort((a, b) => Number(done(a)) - Number(done(b)));
  const doneCount = ids.filter(done).length;
  return (
    <>
      <p className="ttr-note">
        {doneCount} of {ids.length} completed
      </p>
      <ul className="ttr-tickets">
        {sorted.map((id) => {
          const complete = done(id);
          return (
            <li
              key={id}
              tabIndex={0}
              className={`ttr-ticket${complete ? " ttr-ticket-done" : ""}`}
              aria-label={`${TICKETS[id]?.from} to ${TICKETS[id]?.to}, ${TICKETS[id]?.points} points, ${complete ? "completed" : "not completed"}`}
              {...hoverProps(id, hover)}
            >
              <span className="ttr-ticket-mark" aria-hidden="true">
                {complete ? "✓" : ""}
              </span>
              <TicketLabel id={id} done={complete} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function PlayersTable({
  state,
  playerId,
  nameOf,
  focus,
}: {
  state: TTRState;
  playerId: string;
  nameOf: (id: string | null) => string;
  focus?: PlayerFocus;
}) {
  const current = state.phase === "playing" ? state.order[state.current] : null;
  return (
    <table className="ttr-players">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Player</th>
          <th title="Points from claimed routes">Pts</th>
          <th title="Trains left">Trains</th>
          <th title="Cards in hand">Cards</th>
          <th title="Destination tickets">Tkts</th>
        </tr>
      </thead>
      <tbody>
        {state.order.map((pid) => {
          const pts = ROUTES.filter((r) => state.owners[r.id] === pid).reduce(
            (n, r) => n + routePoints(r.length),
            0,
          );
          const isCurrent = pid === current;
          const trains = state.trains[pid] ?? 0;
          return (
            <tr
              key={pid}
              className={
                [isCurrent && "ttr-player-current", focus?.active === pid && "ttr-player-focus"]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              title="Hover to highlight this player's trains on the map"
              {...focusProps(pid, focus)}
            >
              <td>
                <span className="ttr-player-name">
                  <span className="ttr-dot" style={{ background: playerColor(state, pid) }} />
                  <span>
                    {nameOf(pid)}
                    {pid === playerId && <span className="ttr-you"> (you)</span>}
                  </span>
                  {isCurrent && (
                    <span className="ttr-turn-tag" aria-label="current turn">
                      turn
                    </span>
                  )}
                </span>
              </td>
              <td>{pts}</td>
              <td className={trains <= 5 ? "ttr-low" : undefined}>{trains}</td>
              <td>{state.hands[pid]?.length ?? 0}</td>
              <td>{state.tickets[pid]?.length ?? 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Final scores, best first, with the winner(s) marked.
export function Results({
  state,
  nameOf,
  focus,
  hover,
}: {
  state: TTRState;
  nameOf: (id: string | null) => string;
  focus?: PlayerFocus;
  hover: TicketHover;
}) {
  const results = state.results ?? {};
  const rows = state.order
    .filter((pid) => results[pid])
    .sort((a, b) => results[b].total - results[a].total);
  const best = rows.length ? results[rows[0]].total : 0;
  const isWinner = (pid: string) => {
    const w = (results[pid] as { winner?: boolean }).winner;
    return typeof w === "boolean" ? w : results[pid].total === best;
  };
  // Optional score parts (older saved games may not have them).
  const extra = (pid: string, key: string) =>
    (results[pid] as unknown as Record<string, unknown>)[key];
  const hasStations = rows.some((pid) => typeof extra(pid, "stationPoints") === "number");
  return (
    <section className="ttr-card ttr-results" aria-label="Final scores">
      <h3>Final scores</h3>
      <table className="ttr-players ttr-results-table">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Player</th>
            <th title="Route points">Routes</th>
            <th title="Ticket points">Tickets</th>
            {hasStations && <th title="Unused station points">Stns</th>}
            <th title="Longest continuous route">Long</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((pid) => {
            const r = results[pid];
            const winner = isWinner(pid);
            const done = extra(pid, "ticketsCompleted");
            const failed = extra(pid, "ticketsFailed");
            return (
              <tr
                key={pid}
                className={
                  [winner && "ttr-winner", focus?.active === pid && "ttr-player-focus"]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                {...focusProps(pid, focus)}
              >
                <td>
                  <span className="ttr-player-name">
                    <span className="ttr-dot" style={{ background: playerColor(state, pid) }} />
                    {winner && <span aria-label="winner">🏆</span>}
                    {nameOf(pid)}
                  </span>
                </td>
                <td>{r.routePoints}</td>
                <td
                  title={
                    typeof done === "number" ? `${done} completed, ${Number(failed ?? 0)} failed` : undefined
                  }
                >
                  {r.ticketPoints > 0 ? `+${r.ticketPoints}` : r.ticketPoints}
                  {typeof done === "number" && (
                    <span className="ttr-ticket-count">
                      {" "}
                      {done}✓{Number(failed ?? 0) > 0 && ` ${Number(failed)}✗`}
                    </span>
                  )}
                </td>
                {hasStations && <td>{String(extra(pid, "stationPoints") ?? 0)}</td>}
                <td title={r.longestBonus ? "Longest route bonus +10" : undefined}>
                  {r.longestRoute}
                  {r.longestBonus && " ★"}
                </td>
                <td>
                  <strong>{r.total}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="ttr-note" style={{ marginTop: 6 }}>
        ★ longest continuous route (+10).{hasStations && " Unused stations score 4 each."} ✓/✗
        completed and failed tickets. Hover a player to see their trains.
      </p>

      <h4>Everyone's tickets</h4>
      {rows.map((pid) => (
        <details key={pid} className="ttr-player-tickets">
          <summary {...focusProps(pid, focus)} tabIndex={undefined}>
            <span className="ttr-player-name">
              <span className="ttr-dot" style={{ background: playerColor(state, pid) }} />
              {nameOf(pid)}
            </span>
          </summary>
          <TicketList state={state} playerId={pid} hover={hover} />
        </details>
      ))}
    </section>
  );
}

// Winner(s) of a finished game (using the rules' tie-breaks when present).
export function winners(state: TTRState): string[] {
  const results = state.results ?? {};
  const ids = state.order.filter((p) => results[p]);
  if (!ids.length) return [];
  const flagged = ids.filter((p) => (results[p] as { winner?: boolean }).winner === true);
  if (flagged.length) return flagged;
  const best = Math.max(...ids.map((p) => results[p].total));
  return ids.filter((p) => results[p].total === best);
}
