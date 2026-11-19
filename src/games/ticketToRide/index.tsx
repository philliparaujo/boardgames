import { GameDefinition } from "../types";
import { parseAction, reduce } from "./rules";
import { TicketToRideView } from "./TicketToRideView";

const ticketToRide: GameDefinition = {
  type: "ticketToRide",
  title: "Ticket to Ride (Europe)",
  minPlayers: 2,
  maxPlayers: 5,
  parseAction,
  reduce,
  Component: TicketToRideView,
};

export default ticketToRide;
