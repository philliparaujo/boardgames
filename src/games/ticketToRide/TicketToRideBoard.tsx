import { memo, useCallback, useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, CITIES, cityLabel, ROUTES, RouteData } from "./map/europe";
import { routePoints } from "./scoring";
import { TTRState, TrainColor } from "./types";

// Track colors. Gray uses a mid-tone so it reads as a color, not as "missing".
export const ROUTE_FILL: Record<TrainColor | "gray", string> = {
  red: "#e53935",
  orange: "#fb8c00",
  yellow: "#fdd835",
  green: "#43a047",
  blue: "#1e88e5",
  pink: "#d977c6",
  white: "#fafafa",
  black: "#263238",
  gray: "#a3a8ae",
};

// Background colors for each player's routes and stations, by turn order.
export const PLAYER_COLORS = ["#c62828", "#1565c0", "#2e7d32", "#6a1b9a", "#ef6c00"];

export const MAP_BACKGROUND = "#f4eddc";

const CITY_POS = Object.fromEntries(CITIES.map((c) => [c.id, { x: c.x, y: c.y }])) as Record<
  string,
  { x: number; y: number }
>;

const CITY_GAP = 11; // space between a city dot and the first track piece
const PIECE_GAP = 2.5; // space between the pieces of one route
const PARALLEL_OFFSET = 6.5; // distance from the center line for each track of a double
const TRACK_WIDTH = 6; // unclaimed track
const CAR_WIDTH = 13; // claimed train car: about twice as wide as a track
const CAR_STRIPES_ID = "ttr-car-stripes";

// City name placement for crowded spots. Default: up and to the right of the dot.
type LabelPos = { dx: number; dy: number; anchor: "start" | "end" };
const DEFAULT_LABEL: LabelPos = { dx: 10, dy: -10, anchor: "start" };
const LABEL_POS: Record<string, LabelPos> = {
  London: { dx: -11, dy: -8, anchor: "end" },
  Amsterdam: { dx: -8, dy: -13, anchor: "end" },
  Dieppe: { dx: -11, dy: -8, anchor: "end" },
  Paris: { dx: 12, dy: 26, anchor: "start" },
  Bruxelles: { dx: -11, dy: 4, anchor: "end" },
  Brest: { dx: -11, dy: -8, anchor: "end" },
  Essen: { dx: -4, dy: -13, anchor: "end" },
  Frankfurt: { dx: 11, dy: 18, anchor: "start" },
  Zurich: { dx: -11, dy: -8, anchor: "end" },
  Venezia: { dx: -11, dy: 20, anchor: "end" },
  Wien: { dx: -10, dy: -10, anchor: "end" },
  Zagrab: { dx: -11, dy: 4, anchor: "end" },
  Pamplona: { dx: -11, dy: -8, anchor: "end" },
  Madrid: { dx: -10, dy: -10, anchor: "end" },
  Lisboa: { dx: -30, dy: 27, anchor: "start" },
  Palermo: { dx: -11, dy: 4, anchor: "end" },
  Athina: { dx: -11, dy: -6, anchor: "end" },
  Smyrna: { dx: 0, dy: 24, anchor: "start" },
  Angora: { dx: 0, dy: 24, anchor: "start" },
  Erzurum: { dx: -10, dy: 24, anchor: "start" },
  Constantinople: { dx: 11, dy: 16, anchor: "start" },
  Smolensk: { dx: 0, dy: 24, anchor: "start" },
  Berlin: { dx: -4, dy: -13, anchor: "end" },
  Riga: { dx: -11, dy: -6, anchor: "end" },
};

// Route geometry never changes, so it is computed once for the whole map.
interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface Piece extends Segment {
  // Center, length and angle (degrees), for drawing a rotated train car.
  cx: number;
  cy: number;
  len: number;
}
interface RouteGeometry {
  pieces: Piece[];
  hit: Segment; // the full center line, offset for doubles
  span: Segment; // from the first piece's start to the last piece's end
  angle: number;
}

function buildGeometry(route: RouteData, parallel: RouteData[]): RouteGeometry {
  const a = CITY_POS[route.from];
  const b = CITY_POS[route.to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // Doubles are drawn side by side, offset along the perpendicular.
  const index = parallel.findIndex((r) => r.id === route.id);
  const offset = parallel.length > 1 ? (index === 0 ? -PARALLEL_OFFSET : PARALLEL_OFFSET) : 0;
  const ox = -uy * offset;
  const oy = ux * offset;

  // One piece per train, spread evenly between the two city dots.
  const span = Math.max(len - CITY_GAP * 2, route.length * 6);
  const start = (len - span) / 2;
  const step = span / route.length;
  const pieces = Array.from({ length: route.length }, (_, i) => {
    const s0 = start + i * step + PIECE_GAP / 2;
    const s1 = start + (i + 1) * step - PIECE_GAP / 2;
    const x1 = a.x + ux * s0 + ox;
    const y1 = a.y + uy * s0 + oy;
    const x2 = a.x + ux * s1 + ox;
    const y2 = a.y + uy * s1 + oy;
    return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, len: s1 - s0 };
  });
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  return {
    pieces,
    hit: { x1: a.x + ox, y1: a.y + oy, x2: b.x + ox, y2: b.y + oy },
    span: { x1: first.x1, y1: first.y1, x2: last.x2, y2: last.y2 },
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

const GEOMETRY: Record<string, RouteGeometry> = (() => {
  const groups = new Map<string, RouteData[]>();
  for (const r of ROUTES) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  return Object.fromEntries(ROUTES.map((r) => [r.id, buildGeometry(r, groups.get(r.group)!)]));
})();

type Hover = { kind: "route"; route: RouteData } | { kind: "city"; city: string } | null;

interface BoardProps {
  state: TTRState;
  names: Record<string, string>;
  // Returns "Buildable" or the reason this route can't be built by the viewer right now.
  buildStatus: (route: RouteData) => string;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  // When set, cities without a station can be clicked to pick a station location.
  stationMode: boolean;
  selectedCity: string | null;
  onSelectCity: (city: string) => void;
  // Start and end cities of a ticket being hovered in the ticket list.
  highlightTicket: { from: string; to: string } | null;
  // The most recent claim or station, briefly highlighted. `key` restarts the animation.
  recent?: { routeId?: string; city?: string; key: number } | null;
}

export function TicketToRideBoard({
  state,
  names,
  buildStatus,
  selectedRouteId,
  onSelectRoute,
  stationMode,
  selectedCity,
  onSelectCity,
  highlightTicket,
  recent,
}: BoardProps) {
  const [hover, setHover] = useState<Hover>(null);
  const hoverRoute = useCallback((route: RouteData) => setHover({ kind: "route", route }), []);
  const clearHover = useCallback(() => setHover(null), []);

  const playerIndex = (playerId: string | undefined) =>
    playerId ? state.order.indexOf(playerId) : -1;
  const colorOf = (playerId: string | undefined) => {
    const i = playerIndex(playerId);
    return i === -1 ? "#999" : PLAYER_COLORS[i % PLAYER_COLORS.length];
  };
  const initialOf = (playerId: string) =>
    (names[playerId] ?? playerId).trim().charAt(0).toUpperCase() || "?";

  // Unclaimed tracks first, so claimed train cars are drawn on top of everything.
  const open = ROUTES.filter((r) => !state.owners[r.id]);
  const claimed = ROUTES.filter((r) => state.owners[r.id]);
  const recentGeo = recent?.routeId ? GEOMETRY[recent.routeId] : null;
  const recentCity = recent?.city ? CITY_POS[recent.city] : null;

  return (
    <div className="ttr-board">
      <div className="ttr-board-info" aria-live="polite">
        {hover ? (
          <HoverInfo hover={hover} state={state} names={names} buildStatus={buildStatus} />
        ) : stationMode ? (
          "Click a city without a station to build there."
        ) : (
          "Hover a route or city for details · click an open route to claim it."
        )}
      </div>
      <svg
        className="ttr-board-svg"
        viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Ticket to Ride map"
        style={{ background: MAP_BACKGROUND, borderRadius: 8, display: "block" }}
      >
        <defs>
          {/* Diagonal hatching laid over claimed train cars so they never read as open track. */}
          <pattern
            id={CAR_STRIPES_ID}
            width={5}
            height={5}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={2} height={5} fill="#000" opacity={0.38} />
          </pattern>
        </defs>
        {highlightTicket &&
          [highlightTicket.from, highlightTicket.to].map((city) => {
            const p = CITY_POS[city];
            if (!p) return null;
            return (
              <circle
                key={`hl-${city}`}
                cx={p.x}
                cy={p.y}
                r={22}
                fill="rgba(255, 111, 0, 0.22)"
                stroke="#ff6f00"
                strokeWidth={3}
                style={{ pointerEvents: "none" }}
              />
            );
          })}

        {open.map((route) => (
          <OpenTrack
            key={route.id}
            route={route}
            selected={route.id === selectedRouteId}
            hovered={hover?.kind === "route" && hover.route.id === route.id}
            onHover={hoverRoute}
            onLeave={clearHover}
            onSelect={onSelectRoute}
          />
        ))}

        {recentGeo && (
          <line
            key={`recent-${recent!.key}`}
            className="ttr-recent"
            {...recentGeo.span}
            stroke="#ffd54f"
            strokeWidth={CAR_WIDTH + 18}
            strokeLinecap="round"
            style={{ pointerEvents: "none" }}
          />
        )}

        {claimed.map((route) => {
          const owner = state.owners[route.id];
          return (
            <ClaimedTrain
              key={route.id}
              route={route}
              color={colorOf(owner)}
              initial={initialOf(owner)}
              hovered={hover?.kind === "route" && hover.route.id === route.id}
              onHover={hoverRoute}
              onLeave={clearHover}
            />
          );
        })}

        {recentCity && (
          <circle
            key={`recent-city-${recent!.key}`}
            className="ttr-recent"
            cx={recentCity.x}
            cy={recentCity.y}
            r={20}
            fill="#ffd54f"
            style={{ pointerEvents: "none" }}
          />
        )}

        {CITIES.map((city) => {
          const p = CITY_POS[city.id];
          const owner = state.stations[city.id];
          const pickable = stationMode && !owner;
          const isSelected = selectedCity === city.id;
          const label = LABEL_POS[city.id] ?? DEFAULT_LABEL;
          return (
            <g
              key={city.id}
              onMouseEnter={() => setHover({ kind: "city", city: city.id })}
              onMouseLeave={clearHover}
              onClick={() => {
                if (pickable) onSelectCity(city.id);
              }}
              onKeyDown={(e) => {
                if (pickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelectCity(city.id);
                }
              }}
              tabIndex={pickable ? 0 : undefined}
              role={pickable ? "button" : undefined}
              aria-label={pickable ? `Build a station in ${cityLabel(city.id)}` : undefined}
              style={{ cursor: pickable ? "pointer" : "default", outline: "none" }}
              className={pickable ? "ttr-city-pick" : undefined}
            >
              {pickable && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 16 : 13}
                  fill={isSelected ? "rgba(255, 179, 0, 0.35)" : "rgba(255,255,255,0.6)"}
                  stroke={isSelected ? "#e65100" : "#6d5b3f"}
                  strokeWidth={isSelected ? 3 : 1.4}
                  strokeDasharray={isSelected ? undefined : "3 2"}
                />
              )}
              {owner ? (
                <StationMarker x={p.x} y={p.y} color={colorOf(owner)} />
              ) : (
                <circle cx={p.x} cy={p.y} r={7} fill="#fff" stroke="#3a3a3a" strokeWidth={2.5} />
              )}
              <text
                x={p.x + label.dx}
                y={p.y + label.dy}
                textAnchor={label.anchor}
                fontSize={14}
                fontWeight={600}
                fill="#1f1f1f"
                stroke={MAP_BACKGROUND}
                strokeWidth={4}
                paintOrder="stroke"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {cityLabel(city.id)}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend />
    </div>
  );
}

// A station: a small house shape in the owner's color with a dark outline.
function StationMarker({ x, y, color }: { x: number; y: number; color: string }) {
  const d = `M ${x - 8} ${y + 7} L ${x - 8} ${y - 2} L ${x} ${y - 10} L ${x + 8} ${y - 2} L ${x + 8} ${y + 7} Z`;
  return (
    <g>
      <path d={d} fill="none" stroke="#fff" strokeWidth={5} strokeLinejoin="round" />
      <path d={d} fill={color} stroke="#111" strokeWidth={2} strokeLinejoin="round" />
    </g>
  );
}

// An unclaimed route: thin colored track pieces with a dark border (heavy for tunnels).
const OpenTrack = memo(function OpenTrack({
  route,
  selected,
  hovered,
  onHover,
  onLeave,
  onSelect,
}: {
  route: RouteData;
  selected: boolean;
  hovered: boolean;
  onHover: (route: RouteData) => void;
  onLeave: () => void;
  onSelect: (routeId: string) => void;
}) {
  const g = GEOMETRY[route.id];
  const fill = ROUTE_FILL[route.color];
  const borderColor = route.tunnel ? "#000" : "#5a5248";
  const borderWidth = route.tunnel ? TRACK_WIDTH + 5 : TRACK_WIDTH + 2.5;

  return (
    <g
      data-route={route.id}
      onMouseEnter={() => onHover(route)}
      onMouseLeave={onLeave}
      onClick={() => onSelect(route.id)}
      style={{ cursor: "pointer" }}
    >
      {/* Wide invisible hit area so thin routes are easy to hover and tap. */}
      <line {...g.hit} stroke="transparent" strokeWidth={16} />
      {(selected || hovered) && (
        <line
          {...g.span}
          stroke={selected ? "#ffb300" : "#ffe082"}
          strokeWidth={TRACK_WIDTH + 14}
          strokeLinecap="round"
          opacity={0.9}
        />
      )}
      {g.pieces.map((p, i) => (
        <g key={i}>
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={borderColor} strokeWidth={borderWidth} />
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={fill} strokeWidth={TRACK_WIDTH} />
          {/* Ferry: the first pieces carry a locomotive mark, one per required locomotive. */}
          {i < route.locos && (
            <circle cx={p.cx} cy={p.cy} r={2.3} fill="#fff" stroke="#000" strokeWidth={1.1} />
          )}
        </g>
      ))}
    </g>
  );
});

// A claimed route: one train car per piece, about twice as wide as an open track, with a
// white-and-black outline, windows, and the owner's initial on the middle car. This
// reads as "owned" even when the player's color matches the route color.
const ClaimedTrain = memo(function ClaimedTrain({
  route,
  color,
  initial,
  hovered,
  onHover,
  onLeave,
}: {
  route: RouteData;
  color: string;
  initial: string;
  hovered: boolean;
  onHover: (route: RouteData) => void;
  onLeave: () => void;
}) {
  const g = GEOMETRY[route.id];
  const middle = Math.floor((g.pieces.length - 1) / 2);
  // Keep text upright whatever direction the route runs.
  const textAngle = g.angle > 90 || g.angle < -90 ? g.angle + 180 : g.angle;

  return (
    <g onMouseEnter={() => onHover(route)} onMouseLeave={onLeave}>
      <line {...g.hit} stroke="transparent" strokeWidth={18} />
      {/* Soft halo in the player's color along the whole route. */}
      <line
        {...g.span}
        stroke={color}
        strokeWidth={CAR_WIDTH + (hovered ? 14 : 9)}
        strokeLinecap="round"
        opacity={hovered ? 0.45 : 0.28}
      />
      {g.pieces.map((p, i) => {
        const w = p.len + 1; // cars nearly touch, like a coupled train
        const transform = `translate(${p.cx} ${p.cy}) rotate(${g.angle})`;
        return (
          <g key={i} transform={transform}>
            <rect
              x={-w / 2}
              y={-CAR_WIDTH / 2}
              width={w}
              height={CAR_WIDTH}
              rx={3.5}
              fill={color}
              stroke="#fff"
              strokeWidth={4.5}
            />
            <rect
              x={-w / 2}
              y={-CAR_WIDTH / 2}
              width={w}
              height={CAR_WIDTH}
              rx={3.5}
              fill={color}
              stroke="#111"
              strokeWidth={1.8}
            />
            <rect
              x={-w / 2}
              y={-CAR_WIDTH / 2}
              width={w}
              height={CAR_WIDTH}
              rx={3.5}
              fill={`url(#${CAR_STRIPES_ID})`}
            />
            {i === middle ? null : (
              <>
                <rect x={-w / 2 + w * 0.2} y={-2.2} width={Math.min(5, w * 0.22)} height={4.4} rx={1} fill="#fff" opacity={0.9} />
                <rect x={w / 2 - w * 0.2 - Math.min(5, w * 0.22)} y={-2.2} width={Math.min(5, w * 0.22)} height={4.4} rx={1} fill="#fff" opacity={0.9} />
              </>
            )}
          </g>
        );
      })}
      <text
        x={g.pieces[middle].cx}
        y={g.pieces[middle].cy}
        transform={`rotate(${textAngle} ${g.pieces[middle].cx} ${g.pieces[middle].cy})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={800}
        fill="#fff"
        stroke="#111"
        strokeWidth={2}
        paintOrder="stroke"
        style={{ pointerEvents: "none", userSelect: "none", fontFamily: "system-ui, sans-serif" }}
      >
        {initial}
      </text>
    </g>
  );
});

function HoverInfo({
  hover,
  state,
  names,
  buildStatus,
}: {
  hover: NonNullable<Hover>;
  state: TTRState;
  names: Record<string, string>;
  buildStatus: (route: RouteData) => string;
}) {
  if (hover.kind === "city") {
    const owner = state.stations[hover.city];
    return (
      <span>
        <strong>{cityLabel(hover.city)}</strong> ·{" "}
        {owner ? `station: ${names[owner] ?? owner}` : "no station"}
      </span>
    );
  }
  const r = hover.route;
  const owner = state.owners[r.id];
  const status = buildStatus(r);
  const ok = status.startsWith("Buildable");
  return (
    <span>
      <strong>
        {cityLabel(r.from)} – {cityLabel(r.to)}
      </strong>{" "}
      · {r.length} {r.color} · {routePoints(r.length)} pts
      {r.locos > 0 && ` · ferry: ${r.locos} locomotive${r.locos > 1 ? "s" : ""}`}
      {r.tunnel && " · tunnel"} ·{" "}
      {owner ? (
        <strong>claimed by {names[owner] ?? owner}</strong>
      ) : (
        <strong className={ok ? "ttr-ok" : "ttr-bad"}>{status}</strong>
      )}
    </span>
  );
}

function Legend() {
  const sample = (border: string, borderWidth: number, dot: boolean) => (
    <svg width={34} height={14} style={{ verticalAlign: "middle" }} aria-hidden="true">
      <line x1={3} y1={7} x2={31} y2={7} stroke={border} strokeWidth={borderWidth} />
      <line x1={3} y1={7} x2={31} y2={7} stroke={ROUTE_FILL.gray} strokeWidth={TRACK_WIDTH} />
      {dot && <circle cx={17} cy={7} r={2.3} fill="#fff" stroke="#000" strokeWidth={1.1} />}
    </svg>
  );
  return (
    <div className="ttr-legend">
      <span>Each piece = 1 train</span>
      <span>{sample("#000", TRACK_WIDTH + 5, false)} tunnel</span>
      <span>{sample("#5a5248", TRACK_WIDTH + 2.5, true)} ferry (dot = locomotive)</span>
      <span>
        <svg width={40} height={22} style={{ verticalAlign: "middle" }} aria-hidden="true">
          <line x1={4} y1={11} x2={36} y2={11} stroke={PLAYER_COLORS[0]} strokeWidth={CAR_WIDTH + 8} opacity={0.28} strokeLinecap="round" />
          {[0, 1].map((i) => (
            <g key={i}>
              <rect x={5 + i * 15.5} y={11 - CAR_WIDTH / 2} width={14.5} height={CAR_WIDTH} rx={3.5} fill={PLAYER_COLORS[0]} stroke="#fff" strokeWidth={4.5} />
              <rect x={5 + i * 15.5} y={11 - CAR_WIDTH / 2} width={14.5} height={CAR_WIDTH} rx={3.5} fill={PLAYER_COLORS[0]} stroke="#111" strokeWidth={1.8} />
              <rect x={5 + i * 15.5} y={11 - CAR_WIDTH / 2} width={14.5} height={CAR_WIDTH} rx={3.5} fill={`url(#${CAR_STRIPES_ID})`} />
            </g>
          ))}
        </svg>{" "}
        claimed (player's train)
      </span>
      <span>
        <svg width={18} height={20} style={{ verticalAlign: "middle" }} aria-hidden="true">
          <StationMarker x={9} y={11} color={PLAYER_COLORS[1]} />
        </svg>{" "}
        station
      </span>
    </div>
  );
}
