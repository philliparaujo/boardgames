import { useCallback, useEffect, useRef, useState } from "react";
import { GameViewProps } from "../types";
import { cityLabel, ROUTES, RouteData } from "./map/europe";
import { TICKETS } from "./map/tickets";
import { TicketToRideBoard } from "./TicketToRideBoard";
import {
  CardFace,
  cardBackground,
  cardName,
  Hand,
  PaymentPreview,
  PlayersTable,
  playerColor,
  Results,
  PlayerFocus,
  TicketHover,
  TicketList,
  TicketOfferPanel,
  winners,
} from "./TicketToRidePanels";
import { CardColor, TTRState, TrainColor } from "./types";
import { cardLabel, describeCards } from "./deck";
import { RulesPanel } from "./RulesPanel";
import * as rules from "./rules";
import { routeBlockReason } from "./rules";
import { routePoints } from "./scoring";
import {
  countOf,
  grayRouteColors,
  routePayment,
  stationColors,
  stationPayment,
  tunnelPayment,
} from "./payment";
import { isMuted, playSound, setMuted, soundsForChange, unlockAudio } from "./sounds";

// Layout: on wide screens the map fills the space left of a 340px side panel and nothing
// scrolls the page. On narrow screens the turn banner sticks to the top, then the map
// (scrolling in its own box), then the panels. Colors come from the theme in index.css.
const LAYOUT_CSS = `
.ttr-root { box-sizing: border-box; color: var(--ink); }
.ttr-root *, .ttr-root *::before, .ttr-root *::after { box-sizing: border-box; }
.ttr-root section { margin: 0; }
.ttr-root h3 { font-family: var(--font-display); margin: 0 0 8px; font-size: 17px; color: var(--navy); letter-spacing: 0.01em; }
.ttr-root h4 { margin: 12px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.ttr-layout { display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); grid-template-areas: "status" "map" "side"; align-items: start; }
.ttr-status { grid-area: status; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ttr-map { grid-area: map; min-width: 0; overflow: auto; -webkit-overflow-scrolling: touch; position: relative; padding: 8px; }
.ttr-side { grid-area: side; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ttr-board-svg { width: 100%; height: auto; }
.ttr-card { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; box-shadow: var(--shadow); }

/* Turn banner */
.ttr-banner { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--paper); border: 1px solid var(--line); box-shadow: var(--shadow); border-left: 6px solid var(--turn-color, var(--brass)); }
.ttr-banner-mine { background: var(--navy); color: #fff; border-color: var(--navy); border-left-color: var(--gold); }
.ttr-banner-text { min-width: 0; flex: 1; }
.ttr-banner-title { font-family: var(--font-display); font-weight: 700; font-size: 19px; line-height: 1.2; }
.ttr-banner-hint { font-size: 13px; margin-top: 2px; opacity: 0.85; }
.ttr-banner-mine .ttr-banner-hint { opacity: 0.92; }
.ttr-lastround { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: var(--burgundy); color: #fff; font-family: var(--font-body); font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; vertical-align: middle; }
.ttr-mute { flex: none; width: 34px; height: 34px; border-radius: 50%; border: 1px solid currentColor; background: transparent; color: inherit; font-size: 16px; cursor: pointer; line-height: 1; opacity: 0.8; }
.ttr-mute:hover { opacity: 1; }
.ttr-log { list-style: none; margin: 0; padding: 0 4px; font-size: 12.5px; color: var(--muted); }
.ttr-log li { display: flex; gap: 6px; align-items: baseline; margin: 1px 0; }
.ttr-log li:last-child { color: var(--ink); font-weight: 600; }
.ttr-log .ttr-dot { flex: none; transform: translateY(1px); }
.ttr-error { margin: 0; padding: 6px 10px; border-radius: 8px; background: #fdecea; border: 1px solid #f5c2c0; font-size: 14px; }

/* Buttons */
.ttr-btn { min-height: 38px; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--line-strong); background: var(--paper); color: var(--ink); font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; transition: background .15s, box-shadow .15s, transform .05s; }
.ttr-btn:hover:not(:disabled) { background: var(--cream); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.ttr-btn:active:not(:disabled) { transform: translateY(1px); }
.ttr-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.ttr-btn-primary { background: var(--navy); border-color: var(--navy); color: #fff; }
.ttr-btn-primary:hover:not(:disabled) { background: var(--navy-dark); }
.ttr-btn-block { width: 100%; }
.ttr-btn-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.ttr-btn-row .ttr-btn { flex: 1 1 auto; }
.ttr-root button:focus-visible, .ttr-root [tabindex]:focus-visible, .ttr-root input:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.ttr-city-pick:focus-visible circle:first-child { stroke: var(--gold); stroke-width: 4; }

/* Cards (train cards, face-up row, hand) */
.ttr-cardface { position: relative; display: inline-flex; flex-direction: column; justify-content: flex-end; align-items: stretch; border-radius: 6px; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.18); overflow: hidden; flex: none; }
.ttr-cardface-white { box-shadow: 0 0 0 1px rgba(0,0,0,.45), 0 2px 4px rgba(0,0,0,.18); }
.ttr-cardface-md { width: 46px; height: 64px; }
.ttr-cardface-sm { width: 36px; height: 50px; }
.ttr-cardface-name { background: rgba(255,255,255,.9); color: #222; font-size: 10px; font-weight: 700; text-align: center; line-height: 14px; }
.ttr-cardface-sm .ttr-cardface-name { font-size: 9px; line-height: 12px; }
.ttr-cardface-count { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); min-width: 22px; height: 22px; padding: 0 4px; border-radius: 11px; background: rgba(20,20,20,.78); color: #fff; font-weight: 800; font-size: 13px; line-height: 22px; text-align: center; }
.ttr-cardrow { display: flex; gap: 6px; flex-wrap: wrap; }
.ttr-cardbtn { padding: 0; border: none; background: none; border-radius: 8px; cursor: pointer; transition: transform .12s; }
.ttr-cardbtn:hover:not(:disabled) { transform: translateY(-3px); }
.ttr-cardbtn:disabled { cursor: not-allowed; opacity: .72; }
.ttr-cardbtn-new .ttr-cardface { animation: ttr-newcard 2.4s ease-out; }
@keyframes ttr-newcard { 0%, 40% { box-shadow: 0 0 0 3px var(--gold), 0 0 12px 4px var(--gold); } 100% { box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.18); } }
.ttr-deck { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; width: 46px; height: 64px; border-radius: 6px; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.4), 2px 2px 0 -1px var(--paper), 2px 2px 0 0 rgba(0,0,0,.35); background: repeating-linear-gradient(45deg, var(--navy) 0 6px, var(--navy-dark) 6px 12px); color: #fff; font-size: 10px; font-weight: 700; line-height: 1.2; text-align: center; }
.ttr-deck-btn { display: flex; align-items: center; gap: 10px; width: 100%; margin: 8px 0 0; font-weight: 600; text-align: left; }
.ttr-deck-btn .ttr-deck { width: 20px; height: 28px; border-width: 1px; flex: none; }
.ttr-deck-count { margin-left: auto; font-size: 12px; font-weight: 400; opacity: 0.75; }
.ttr-hand { display: flex; flex-wrap: wrap; gap: 5px; }
.ttr-drawn { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 6px 10px; border-radius: 8px; border: 2px solid var(--gold); background: var(--cream); font-weight: 700; font-size: 14px; animation: ttr-drawn 1.6s ease-out; }
.ttr-drawn .ttr-cardface { animation: ttr-newcard 2.4s ease-out; }
.ttr-drawn-names { font-weight: 400; color: var(--muted); text-transform: capitalize; }
@keyframes ttr-drawn { 0% { transform: scale(.9); opacity: 0; } 20% { transform: scale(1.04); opacity: 1; } 100% { transform: none; } }
.ttr-log-paid { white-space: nowrap; }
.ttr-log-paid .ttr-pay { display: inline-flex; vertical-align: middle; gap: 2px 8px; font-size: 12px; }
.ttr-log-paid .ttr-pay-swatch { width: 10px; height: 13px; }
.ttr-pay { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; }
.ttr-pay-item { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
.ttr-pay-swatch { display: inline-block; width: 12px; height: 16px; border-radius: 3px; box-shadow: 0 0 0 1px rgba(0,0,0,.45); }
.ttr-swatches { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 2px; }
.ttr-swatch-btn { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px 4px 5px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--paper); font: inherit; font-size: 13px; cursor: pointer; }
.ttr-swatch-btn[aria-pressed="true"] { border-color: var(--navy); box-shadow: inset 0 0 0 1px var(--navy); background: var(--cream); font-weight: 700; }
.ttr-swatch-btn .ttr-pay-swatch { width: 14px; height: 18px; }

/* Action card */
.ttr-actions-hint { font-size: 13px; color: var(--muted); margin: 8px 0 0; }
.ttr-step { font-size: 12px; font-weight: 600; color: var(--burgundy); text-transform: none; letter-spacing: 0; margin-left: 6px; }
.ttr-pick { border: 2px solid var(--gold); background: var(--cream); border-radius: 10px; padding: 10px 12px; margin-bottom: 4px; }
.ttr-pick-title { font-weight: 700; font-size: 15px; margin: 0 0 2px; }
.ttr-pick-meta { font-size: 13px; color: var(--muted); margin: 0 0 8px; }
.ttr-pick-line { font-size: 13.5px; margin: 6px 0 0; }
.ttr-reason { font-size: 13px; color: var(--muted); margin: 6px 0 0; }
.ttr-ok { color: #1b5e20; }
.ttr-bad { color: #a4161a; }
.ttr-note { font-size: 13px; color: var(--muted); margin: 0 0 8px; }
.ttr-muted { font-size: 13px; color: var(--muted); margin: 0; }

/* Tickets */
.ttr-offer { border: 2px solid var(--gold); background: var(--cream); }
.ttr-tickets { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ttr-tickets li { margin: 0; }
.ttr-ticket { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; font-size: 14px; background: var(--paper); border: 1px dashed var(--line-strong); cursor: default; }
.ttr-ticket label { display: flex; align-items: center; gap: 8px; width: 100%; cursor: pointer; }
.ttr-ticket:hover, .ttr-ticket:focus-visible { background: #fff3e0; border-color: #ff9800; }
.ttr-ticket-kept { border-style: solid; border-color: var(--navy); }
.ttr-ticket-done { background: #edf6ee; border-style: solid; border-color: #a5d6a7; }
.ttr-ticket-cities { flex: 1; min-width: 0; }
.ttr-ticket-mark { width: 14px; flex: none; color: #2e7d32; font-weight: 800; }
.ttr-points { flex: none; min-width: 28px; padding: 0 6px; border-radius: 999px; background: var(--navy); color: #fff; font-size: 12px; font-weight: 700; text-align: center; line-height: 20px; }
.ttr-points-done { background: #2e7d32; }

/* Players */
.ttr-players { width: 100%; font-size: 13px; border-collapse: collapse; }
.ttr-players th { font-weight: 600; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 4px 4px; border-bottom: 1px solid var(--line); }
.ttr-players td { padding: 5px 4px; text-align: center; border-bottom: 1px solid var(--line); }
.ttr-players tr:last-child td { border-bottom: none; }
.ttr-players td:first-child { text-align: left; }
.ttr-player-name { display: inline-flex; align-items: center; gap: 6px; }
.ttr-player-current td { background: #fff4d6; }
.ttr-player-current td:first-child { box-shadow: inset 3px 0 0 var(--gold); font-weight: 700; }
.ttr-turn-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0 5px; border-radius: 4px; background: var(--gold); color: #3b2a00; }
.ttr-you { color: var(--muted); font-weight: 400; }
.ttr-ticket-count { display: block; font-size: 10.5px; color: var(--muted); font-weight: 400; white-space: nowrap; }
.ttr-results-table td, .ttr-results-table th { padding-left: 2px; padding-right: 2px; }
.ttr-results-table th { letter-spacing: 0; font-size: 10.5px; }
.ttr-low { color: var(--burgundy); font-weight: 700; }
.ttr-dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
.ttr-winner td { background: #fff4d6; font-weight: 700; }
.ttr-results { border: 2px solid var(--gold); }
.ttr-rules summary { cursor: pointer; font-family: var(--font-display); color: var(--navy); }
.ttr-rules { font-size: 13px; }

/* Map */
.ttr-board-info { min-height: 30px; padding: 5px 10px; margin-bottom: 6px; background: var(--cream); border: 1px solid var(--line); border-radius: 8px; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ttr-players tbody tr[tabindex] { cursor: pointer; outline: none; }
.ttr-players tbody tr.ttr-player-focus td { background: color-mix(in srgb, var(--brass, #c9a227) 22%, transparent); }
.ttr-player-tickets { margin: 2px 0; }
.ttr-player-tickets summary { cursor: pointer; padding: 3px 0; }
.ttr-player-tickets summary .ttr-player-name { display: inline-flex; }
.ttr-player-tickets .ttr-tickets { margin-bottom: 6px; }
.ttr-legend {font-size: 12.5px; color: var(--muted); margin-top: 6px; display: flex; gap: 6px 16px; flex-wrap: wrap; align-items: center; }
.ttr-ticket-pulse { transform-box: fill-box; transform-origin: center; animation: ttr-ticket-pulse 1.3s ease-out infinite; }
@keyframes ttr-ticket-pulse { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(2.1); opacity: 0; } }
.ttr-recent { animation: ttr-recent 4.5s ease-out forwards; }
@keyframes ttr-recent { 0% { opacity: .95; } 15% { opacity: .25; } 30% { opacity: .95; } 45% { opacity: .25; } 60% { opacity: .9; } 100% { opacity: 0; } }
.ttr-gameover { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; width: min(420px, calc(100% - 32px)); text-align: center; background: var(--paper); border: 3px double var(--gold); border-radius: 14px; padding: 20px 24px; box-shadow: 0 12px 40px rgba(0,0,0,.3); }
.ttr-gameover h2 { font-family: var(--font-display); font-size: 30px; margin: 0 0 4px; color: var(--navy); }
.ttr-gameover p { margin: 0 0 14px; color: var(--muted); }
.ttr-root .ttr-waiting { max-width: 520px; margin: 24px auto; text-align: center; }
.ttr-waiting ul { list-style: none; padding: 0; margin: 12px 0; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.ttr-waiting li { margin: 0; padding: 4px 12px; border-radius: 999px; background: var(--cream); border: 1px solid var(--line); font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
  .ttr-recent, .ttr-cardbtn-new .ttr-cardface, .ttr-drawn, .ttr-drawn .ttr-cardface, .ttr-ticket-pulse { animation: none; }
  .ttr-btn, .ttr-cardbtn { transition: none; }
}

/* Wide screens: the game fills the window. */
@media (min-width: 1000px) {
  .ttr-root { height: 100%; }
  .ttr-layout { height: 100%; grid-template-columns: minmax(0, 1fr) 340px; grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "map status" "map side"; align-items: stretch; }
  .ttr-map { height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  .ttr-board { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .ttr-board-svg { flex: 1; min-height: 0; height: 100%; }
  .ttr-side { height: 100%; overflow-y: auto; padding: 0 2px 2px; }
  .ttr-offer-map { display: none; }
}
@media (max-width: 999px) {
  .ttr-status { position: sticky; top: 0; z-index: 5; background: var(--bg); padding: 4px 0; }
  .ttr-offer-side { display: none; }
  .ttr-offer-map { margin-bottom: 8px; }
  .ttr-map { max-height: 62vh; }
  .ttr-board-svg { min-width: 170%; }
  .ttr-board-info { white-space: normal; }
}
`;

interface Recent {
  routeId?: string;
  city?: string;
  slots: number[];
  key: number;
}

export function TicketToRideView({ game, playerId, onAction }: GameViewProps) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [grayColor, setGrayColor] = useState<TrainColor | null>(null);
  const [stationMode, setStationMode] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  // undefined = automatic choice; null = pay with rainbows only.
  const [stationColor, setStationColor] = useState<TrainColor | null | undefined>(undefined);
  const [keepIds, setKeepIds] = useState<number[]>([]);
  // Ticket hovered (or tapped) in a ticket list; its endpoints are highlighted on the map.
  const [hoveredTicket, setHoveredTicket] = useState<number | null>(null);
  const highlightTicket = hoveredTicket !== null ? TICKETS[hoveredTicket] ?? null : null;
  const ticketHover: TicketHover = { active: hoveredTicket, set: setHoveredTicket };
  // Player hovered in the players or results table; their pieces are highlighted on the map.
  const [focusedPlayer, setFocusedPlayer] = useState<string | null>(null);
  const playerFocus: PlayerFocus = { active: focusedPlayer, set: setFocusedPlayer };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [overlayClosed, setOverlayClosed] = useState(false);
  // Cards I drew this turn (shown face up, so a blind draw's color is obvious).
  const [drawnCards, setDrawnCards] = useState<{ cards: CardColor[]; key: number }>({ cards: [], key: 0 });

  // Audio can only start after a user gesture; unlock it on the first click or key.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // For changes between snapshots (yours and other players' moves): play sounds and
  // briefly highlight the newest route, station and face-up cards. The first snapshot
  // after loading is silent.
  const prevState = useRef<TTRState | null>(null);
  useEffect(() => {
    const next = (game.state as TTRState | undefined) ?? null;
    const prev = prevState.current;
    prevState.current = next;
    if (!prev || !next) return;
    soundsForChange(prev, next, playerId).forEach((name, i) => playSound(name, i * 0.45));

    const routeId = Object.keys(next.owners ?? {}).find((id) => !prev.owners?.[id]);
    const city = Object.keys(next.stations ?? {}).find((c) => !prev.stations?.[c]);
    const slots = (next.faceUp ?? [])
      .map((card, i) => (prev.faceUp?.[i] !== card ? i : -1))
      .filter((i) => i >= 0);
    if (routeId || city || slots.length) {
      setRecent((r) => ({ routeId, city, slots, key: (r?.key ?? 0) + 1 }));
    }

    // Cards I just drew. On my turn the hand only grows by drawing, except when a tunnel
    // is given up and its cards come back.
    const mine = (st: TTRState) => st.phase === "playing" && st.order[st.current] === playerId;
    const drewNow =
      mine(prev) &&
      !prev.pendingTunnel &&
      (next.hands[playerId]?.length ?? 0) > (prev.hands[playerId]?.length ?? 0);
    if (drewNow) {
      const gained = [...(next.hands[playerId] ?? [])];
      for (const c of prev.hands[playerId] ?? []) {
        const i = gained.indexOf(c);
        if (i !== -1) gained.splice(i, 1);
      }
      if (gained.length) {
        setDrawnCards((d) => ({
          cards: prev.drawnThisTurn > 0 ? [...d.cards, ...gained] : gained,
          key: d.key + 1,
        }));
      }
    } else if (mine(next) && !mine(prev)) {
      setDrawnCards((d) => ({ cards: [], key: d.key }));
    }
  }, [game.state, playerId]);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const names = Object.fromEntries(game.players.map((p) => [p.id, p.name]));
  const nameOf = (id: string | null) => (id ? names[id] ?? id : "");
  const isHost = playerId === game.createdBy;

  // Runs an action and shows any rejection from the reducer.
  const run = async (action: unknown, after?: () => void) => {
    setError(null);
    setBusy(true);
    try {
      await onAction(action);
      after?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const s = (game.state as TTRState | undefined) ?? null;
  const myHand = s?.hands?.[playerId] ?? [];
  const phase = s?.phase;
  const myOffer = s?.offers?.[playerId];
  const currentId = s ? s.order[s.current] : null;
  const isMyTurn = phase === "playing" && currentId === playerId && !myOffer;

  // Stable callbacks so the memoized map tracks don't re-render on every hover.
  const latest = useRef({ s, myHand, isMyTurn, grayColor });
  latest.current = { s, myHand, isMyTurn, grayColor };
  const buildStatus = useCallback(
    (route: RouteData) => {
      const { s, myHand, isMyTurn, grayColor } = latest.current;
      if (!s) return "";
      const blocked = routeBlockReason(s, playerId, route);
      if (blocked) return blocked;
      if (!isMyTurn) return "Buildable (not your turn)";
      return routePayment(myHand, route, grayColor) ? "Buildable" : "Not enough matching cards";
    },
    [playerId],
  );
  // Station picking only makes sense on your own turn; leave it when the turn passes.
  useEffect(() => {
    if (!isMyTurn) {
      setStationMode(false);
      setSelectedCity(null);
    }
  }, [isMyTurn]);
  const onSelectRoute = useCallback((id: string) => {
    setSelectedRouteId(id);
    setStationMode(false);
    setSelectedCity(null);
    setError(null);
  }, []);
  const onSelectCity = useCallback((city: string) => {
    setSelectedCity(city);
    setError(null);
  }, []);

  if (game.status === "waiting" || !s) {
    return (
      <div className="ttr-root">
        <style>{LAYOUT_CSS}</style>
        <section className="ttr-card ttr-waiting" aria-label="Waiting room">
          <h3>Waiting for players</h3>
          <p className="ttr-note">
            {game.players.length} of {game.maxPlayers} seats taken. Share this page's link to invite
            friends.
          </p>
          <ul>
            {game.players.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.id === game.createdBy && " (host)"}
              </li>
            ))}
          </ul>
          {isHost ? (
            <>
              <button
                className="ttr-btn ttr-btn-primary"
                disabled={busy || game.players.length < 2}
                onClick={() => run({ type: "start" })}
              >
                Start game
              </button>
              {game.players.length < 2 && <p className="ttr-reason">At least 2 players are needed.</p>}
            </>
          ) : (
            <p className="ttr-muted">Waiting for the host to start the game.</p>
          )}
          {error && (
            <p role="alert" className="ttr-error" style={{ marginTop: 10 }}>
              {error}
            </p>
          )}
        </section>
      </div>
    );
  }

  const selectedRoute = ROUTES.find((r) => r.id === selectedRouteId) ?? null;
  const drawn = isMyTurn ? s.drawnThisTurn ?? 0 : 0;
  // A tunnel claim waiting for its player to pay the extra cards or give up.
  const tunnel = s.pendingTunnel ?? null;
  const myTunnel = tunnel && tunnel.playerId === playerId ? tunnel : null;
  const tunnelRoute = tunnel ? ROUTES.find((r) => r.id === tunnel.routeId) ?? null : null;
  const tunnelPay = myTunnel ? tunnelPayment(myHand, myTunnel.payColor, myTunnel.extra) : null;
  const mayPass = isMyTurn && canPassSafe(s, playerId);

  // Why the turn actions are unavailable, shown as text under the buttons.
  const turnBlock: string | null =
    phase === "finished"
      ? "The game is over."
      : myOffer
        ? "Choose your tickets first."
        : phase === "setup"
          ? "Waiting for the other players to choose tickets."
          : !isMyTurn
            ? `Waiting for ${nameOf(currentId)}.`
            : myTunnel
              ? "Pay for the tunnel or give it up first."
              : null;
  const afterDrawBlock = drawn > 0 ? "You've started drawing cards; take one more card." : null;

  const toggleKeep = (id: number) =>
    setKeepIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const keepTickets = () => run({ type: "keepTickets", ids: keepIds }, () => setKeepIds([]));

  // Stations
  const ownedStations = Object.values(s.stations).filter((o) => o === playerId).length;
  const stationCost = ownedStations + 1;
  const stationBlock =
    turnBlock ?? afterDrawBlock ?? (ownedStations >= 3 ? "You've built all 3 stations." : null);
  const stationChoices = stationColors(myHand, stationCost);
  const chosenStationColor =
    stationColor !== undefined && stationChoices.includes(stationColor)
      ? stationColor
      : stationChoices[0];
  const stationPay =
    chosenStationColor === undefined ? null : stationPayment(myHand, stationCost, chosenStationColor);
  const placeStation = () => {
    if (!selectedCity) return;
    if (!stationPay) {
      setError(`You need ${stationCost} matching card(s) for a station.`);
      return;
    }
    run({ type: "placeStation", city: selectedCity, payment: stationPay }, () => {
      setSelectedCity(null);
      setStationMode(false);
    });
  };

  // Routes
  const grayChoices = selectedRoute?.color === "gray" ? grayRouteColors(myHand, selectedRoute) : [];
  const payment = selectedRoute ? routePayment(myHand, selectedRoute, grayColor) : null;
  const payColor = payment?.find((c) => c !== "loco") as TrainColor | undefined;
  const routeBlock = selectedRoute
    ? turnBlock ??
      afterDrawBlock ??
      routeBlockReason(s, playerId, selectedRoute) ??
      (payment ? null : "Not enough matching cards in your hand.")
    : null;
  const claim = (route: RouteData) => {
    if (!payment) {
      setError("You don't have enough matching cards for this route.");
      return;
    }
    run({ type: "claimRoute", routeId: route.id, payment }, () => setSelectedRouteId(null));
  };

  // Turn banner
  const winnerIds = phase === "finished" ? winners(s) : [];
  const turnColor = currentId ? playerColor(s, currentId) : undefined;
  const turnTitle =
    phase === "finished"
      ? "Game over"
      : phase === "setup"
        ? myOffer
          ? "Choose your tickets"
          : "Waiting for others"
        : isMyTurn
          ? "Your turn"
          : `${nameOf(currentId)}'s turn`;
  const turnHint =
    phase === "finished"
      ? winnerIds.length
        ? `${winnerIds.map(nameOf).join(" & ")} win${winnerIds.length > 1 ? "" : "s"} with ${s.results?.[winnerIds[0]]?.total ?? 0} points.`
        : "Final scores are below."
      : phase === "setup"
        ? myOffer
          ? `Keep at least ${myOffer.min} destination tickets.`
          : "Other players are still choosing tickets."
        : myOffer
          ? "Choose which of the new tickets to keep."
          : myTunnel
            ? `Tunnel! Pay ${myTunnel.extra} more card${myTunnel.extra === 1 ? "" : "s"} or give it up.`
          : tunnel && tunnelRoute
            ? `${nameOf(tunnel.playerId)} is deciding on the ${cityLabel(tunnelRoute.from)}–${cityLabel(tunnelRoute.to)} tunnel.`
          : mayPass
            ? "No legal move is left: you may pass."
          : isMyTurn
            ? drawn > 0
              ? "Take 1 more card (a face-up rainbow isn't allowed now)."
              : "Draw 2 cards, claim a route, draw tickets, or build a station."
            : "Watch the map for their move.";

  const ticketOffer = (className: string) =>
    myOffer && phase !== "finished" ? (
      <TicketOfferPanel
        className={className}
        offer={myOffer}
        keepIds={keepIds}
        onToggle={toggleKeep}
        onKeep={keepTickets}
        busy={busy}
        hover={ticketHover}
      />
    ) : null;

  const colorChoice = <T extends TrainColor | null>(
    choices: T[],
    value: T | undefined,
    onPick: (c: T) => void,
  ) => (
    <div className="ttr-swatches" role="group" aria-label="Pay with color">
      {choices.map((c) => (
        <button
          key={c ?? "loco"}
          type="button"
          className="ttr-swatch-btn"
          aria-pressed={c === value}
          onClick={() => onPick(c)}
        >
          <span className="ttr-pay-swatch" style={{ background: cardBackground(c ?? "loco") }} />
          {c ? `${cardName(c)} (${countOf(myHand, c)})` : "Rainbows only"}
        </button>
      ))}
    </div>
  );

  const recentSlots = recent?.slots ?? [];
  const log = s.log.slice(-3);

  return (
    <div className="ttr-root">
      <style>{LAYOUT_CSS}</style>

      <div className="ttr-layout">
        <section className="ttr-status" aria-label="Status">
          <div
            className={`ttr-banner${isMyTurn ? " ttr-banner-mine" : ""}`}
            style={{ ["--turn-color" as string]: phase === "playing" ? turnColor : undefined }}
            role="status"
            aria-live="polite"
          >
            <div className="ttr-banner-text">
              <div className="ttr-banner-title">
                {turnTitle}
                {s.lastRoundBy && phase !== "finished" && (
                  <span className="ttr-lastround">
                    Last round
                    {typeof s.finalTurnsLeft === "number" &&
                      ` · ${s.finalTurnsLeft} turn${s.finalTurnsLeft === 1 ? "" : "s"} left`}
                  </span>
                )}
              </div>
              <div className="ttr-banner-hint">{turnHint}</div>
            </div>
            <button
              className="ttr-mute"
              onClick={toggleMute}
              title={muted ? "Turn sounds on" : "Turn sounds off"}
              aria-label={muted ? "Turn sounds on" : "Turn sounds off"}
              aria-pressed={muted}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
          <ul className="ttr-log" aria-label="Recent moves">
            {log.map((entry, i) => (
              <li key={s.log.length - log.length + i}>
                {entry.by ? (
                  <span className="ttr-dot" style={{ background: playerColor(s, entry.by) }} />
                ) : (
                  <span className="ttr-dot" style={{ background: "transparent", boxShadow: "none" }} />
                )}
                <span>
                  {entry.by ? `${nameOf(entry.by)} ${entry.text}` : entry.text}
                  {entry.cards?.length ? (
                    <span className="ttr-log-paid" aria-label={`paid ${describeCards(entry.cards)}`}>
                      {" "}
                      paid <PaymentPreview payment={entry.cards} />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="ttr-error">
              {error}
            </p>
          )}
        </section>

        <div className="ttr-map ttr-card">
          {ticketOffer("ttr-offer-map")}
          {phase === "finished" && !overlayClosed && (
            <div className="ttr-gameover" role="dialog" aria-label="Game over">
              <h2>{winnerIds.length ? `${winnerIds.map(nameOf).join(" & ")} win${winnerIds.length > 1 ? "" : "s"}!` : "Game over"}</h2>
              <p>{winnerIds.includes(playerId) ? "Congratulations, conductor!" : "Final scores are in the side panel."}</p>
              <button className="ttr-btn ttr-btn-primary" onClick={() => setOverlayClosed(true)}>
                View the board
              </button>
            </div>
          )}
          <TicketToRideBoard
            state={s}
            names={names}
            buildStatus={buildStatus}
            selectedRouteId={tunnel ? tunnel.routeId : selectedRouteId}
            onSelectRoute={onSelectRoute}
            stationMode={stationMode}
            selectedCity={selectedCity}
            onSelectCity={onSelectCity}
            highlightTicket={highlightTicket}
            highlightPlayer={focusedPlayer}
            recent={recent}
          />
        </div>

        <aside className="ttr-side" aria-label="Game panel">
          {ticketOffer("ttr-offer-side")}

          {phase === "finished" && s.results && <Results state={s} nameOf={nameOf} focus={playerFocus} hover={ticketHover} />}

          {phase !== "finished" && (
            <section className="ttr-card" aria-label="Turn actions">
              {myTunnel && (
                <div className="ttr-pick" aria-label="Tunnel">
                  <p className="ttr-pick-title">
                    Tunnel
                    {tunnelRoute && `: ${cityLabel(tunnelRoute.from)} – ${cityLabel(tunnelRoute.to)}`}
                  </p>
                  <p className="ttr-pick-meta">
                    Revealed from the deck:
                  </p>
                  <div className="ttr-hand" style={{ marginBottom: 6 }}>
                    {myTunnel.revealed.length ? (
                      myTunnel.revealed.map((c, i) => <CardFace key={i} card={c} size="sm" />)
                    ) : (
                      <span className="ttr-muted">nothing</span>
                    )}
                  </div>
                  <p className="ttr-pick-line">
                    {myTunnel.extra} extra {myTunnel.payColor === "loco" ? "rainbow" : `${myTunnel.payColor} or rainbow`} card
                    {myTunnel.extra === 1 ? "" : "s"} needed.{" "}
                    {tunnelPay ? (
                      <>
                        Pay: <PaymentPreview payment={tunnelPay} />
                      </>
                    ) : (
                      <span className="ttr-bad">You don't have enough matching cards.</span>
                    )}
                  </p>
                  <div className="ttr-btn-row">
                    <button
                      className="ttr-btn ttr-btn-primary"
                      disabled={busy || !tunnelPay}
                      onClick={() => tunnelPay && run({ type: "payTunnel", payment: tunnelPay })}
                    >
                      Pay {myTunnel.extra} more
                    </button>
                    <button className="ttr-btn" disabled={busy} onClick={() => run({ type: "declineTunnel" })}>
                      Give up
                    </button>
                  </div>
                </div>
              )}

              {mayPass && (
                <div className="ttr-pick" aria-label="Pass">
                  <p className="ttr-pick-meta" style={{ margin: 0 }}>
                    No card, ticket, route or station is available to you.
                  </p>
                  <div className="ttr-btn-row">
                    <button className="ttr-btn ttr-btn-primary" disabled={busy} onClick={() => run({ type: "pass" })}>
                      Pass this turn
                    </button>
                  </div>
                </div>
              )}

              {selectedRoute && !myTunnel && (
                <div className="ttr-pick" aria-label="Selected route">
                  <p className="ttr-pick-title">
                    {cityLabel(selectedRoute.from)} – {cityLabel(selectedRoute.to)}
                  </p>
                  <p className="ttr-pick-meta">
                    {selectedRoute.length} {selectedRoute.color} · {routePoints(selectedRoute.length)} pts
                    {selectedRoute.locos > 0 &&
                      ` · ferry, ${selectedRoute.locos} rainbow${selectedRoute.locos > 1 ? "s" : ""}`}
                    {selectedRoute.tunnel && " · tunnel (may cost extra)"}
                  </p>
                  {selectedRoute.color === "gray" &&
                    grayChoices.length > 1 &&
                    colorChoice(grayChoices, payColor, (c) => setGrayColor(c))}
                  <p className="ttr-pick-line">
                    {payment ? (
                      <>
                        Pay: <PaymentPreview payment={payment} />
                      </>
                    ) : (
                      <span className="ttr-bad">Not payable with your hand.</span>
                    )}
                  </p>
                  <div className="ttr-btn-row">
                    <button
                      className="ttr-btn ttr-btn-primary"
                      disabled={busy || !!routeBlock}
                      title={routeBlock ?? undefined}
                      onClick={() => claim(selectedRoute)}
                    >
                      Claim route
                    </button>
                    <button className="ttr-btn" onClick={() => setSelectedRouteId(null)}>
                      Cancel
                    </button>
                  </div>
                  {routeBlock && <p className="ttr-reason">{routeBlock}</p>}
                </div>
              )}

              {stationMode && !myTunnel && (
                <div className="ttr-pick" aria-label="Build a station">
                  <p className="ttr-pick-title">
                    {selectedCity ? `Station in ${cityLabel(selectedCity)}` : "Build a station"}
                  </p>
                  <p className="ttr-pick-meta">
                    {selectedCity
                      ? `Costs ${stationCost} card${stationCost > 1 ? "s" : ""} of one color.`
                      : "Click a city without a station on the map."}
                  </p>
                  {stationChoices.length > 1 &&
                    colorChoice(stationChoices, chosenStationColor, (c) => setStationColor(c))}
                  <p className="ttr-pick-line">
                    {stationPay ? (
                      <>
                        Pay: <PaymentPreview payment={stationPay} />
                      </>
                    ) : (
                      <span className="ttr-bad">
                        You need {stationCost} cards of one color (or rainbows).
                      </span>
                    )}
                  </p>
                  <div className="ttr-btn-row">
                    <button
                      className="ttr-btn ttr-btn-primary"
                      disabled={busy || !!stationBlock || !selectedCity || !stationPay}
                      title={stationBlock ?? (selectedCity ? undefined : "Pick a city first")}
                      onClick={placeStation}
                    >
                      Place station
                    </button>
                    <button
                      className="ttr-btn"
                      onClick={() => {
                        setStationMode(false);
                        setSelectedCity(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <h4 style={{ marginTop: selectedRoute || stationMode ? 12 : 0 }}>
                Draw cards
                {drawn > 0 && <span className="ttr-step">1 of 2 taken</span>}
              </h4>
              <div className="ttr-cardrow">
                {s.faceUp.map((card, slot) => {
                  const lockedLoco = card === "loco" && drawn > 0;
                  const reason = turnBlock ?? (lockedLoco ? "You can't take a face-up rainbow as your second card." : null);
                  return (
                    <button
                      key={`${slot}-${recent?.key ?? 0}`}
                      className={`ttr-cardbtn${recentSlots.includes(slot) ? " ttr-cardbtn-new" : ""}`}
                      disabled={busy || !!reason}
                      title={reason ?? `Take the ${cardLabel(card)} card`}
                      aria-label={`Take face-up ${cardName(card)} card`}
                      onClick={() => run({ type: "drawFaceUp", slot })}
                    >
                      <CardFace card={card} />
                    </button>
                  );
                })}
              </div>
              <button
                className="ttr-btn ttr-deck-btn"
                disabled={busy || !!turnBlock}
                title={turnBlock ?? "Draw the top card of the deck without seeing it first"}
                onClick={() => run({ type: "drawDeck" })}
              >
                <span className="ttr-deck" aria-hidden="true" />
                Draw blind from deck
                <span
                  className="ttr-deck-count"
                  title="When the deck runs out, the discard pile is shuffled into a new deck."
                >
                  {s.deck.length} in deck · {s.discard.length} discarded
                </span>
              </button>
              {drawnCards.cards.length > 0 && (
                <div className="ttr-drawn" key={drawnCards.key} aria-live="polite">
                  <span>You drew</span>
                  {drawnCards.cards.map((c, i) => (
                    <CardFace key={i} card={c} size="sm" />
                  ))}
                  <span className="ttr-drawn-names">
                    {drawnCards.cards.map((c) => cardLabel(c)).join(" + ")}
                  </span>
                </div>
              )}

              <h4>Other actions</h4>
              <div className="ttr-btn-row" style={{ marginTop: 0 }}>
                <button
                  className="ttr-btn"
                  disabled={busy || !!turnBlock || !!afterDrawBlock}
                  title={turnBlock ?? afterDrawBlock ?? "Draw 3 destination tickets and keep at least 1"}
                  onClick={() => run({ type: "drawTickets" })}
                >
                  Draw tickets
                </button>
                <button
                  className="ttr-btn"
                  disabled={busy || !!stationBlock || stationMode}
                  title={stationBlock ?? `Next station costs ${stationCost} card${stationCost > 1 ? "s" : ""}`}
                  onClick={() => {
                    setStationMode(true);
                    setSelectedRouteId(null);
                    setError(null);
                  }}
                >
                  Build station ({3 - ownedStations} left)
                </button>
              </div>
              <p className="ttr-actions-hint">
                {turnBlock ?? afterDrawBlock ?? (selectedRoute ? "" : "To claim a route, click it on the map.")}
              </p>
            </section>
          )}

          <section className="ttr-card" aria-label="Your hand">
            <h3>
              Your hand <span className="ttr-step" style={{ color: "var(--muted)" }}>{myHand.length} cards</span>
            </h3>
            <Hand hand={myHand} />
            <h4>Your tickets</h4>
            <TicketList state={s} playerId={playerId} hover={ticketHover} />
          </section>

          <section className="ttr-card" aria-label="Players">
            <h3>Players</h3>
            <PlayersTable state={s} playerId={playerId} nameOf={nameOf} focus={playerFocus} />
          </section>

          <section className="ttr-card ttr-rules" aria-label="Rules">
            <RulesPanel />
          </section>
        </aside>
      </div>
    </div>
  );
}

// Whether the rules allow passing (only when no other move is possible).
function canPassSafe(s: TTRState, playerId: string): boolean {
  try {
    return typeof rules.canPass === "function" && rules.canPass(s, playerId);
  } catch {
    return false;
  }
}
