// In-app rules summary, following the official Ticket to Ride: Europe rules.
export function RulesPanel() {
  return (
    <details>
      <summary>
        <strong>Rules</strong>
      </summary>

      <h4>Setup</h4>
      <ul>
        <li>Each player starts with 45 trains, 3 stations and 4 train cards.</li>
        <li>Five cards are face-up. If 3 or more of them are rainbows, all five are discarded and replaced.</li>
        <li>
          Each player is dealt 1 long route ticket and 3 regular tickets and must keep at least 2. Tickets not
          kept are removed from the game.
        </li>
      </ul>

      <h4>On your turn</h4>
      <p>Do one of these:</p>
      <ul>
        <li>
          <strong>Draw train cards:</strong> take two cards, from the face-up row or the deck. Taking a face-up
          rainbow ends your draw, and you can't take one as your second card. A rainbow drawn blind from
          the deck counts as a normal card. When the deck runs out, the discards are shuffled into a new deck.
        </li>
        <li>
          <strong>Draw destination tickets:</strong> take 3 and keep at least 1. The rest go to the bottom of the
          ticket deck.
        </li>
        <li>
          <strong>Claim a route:</strong> pay with cards matching its color (gray accepts any single color), plus
          rainbows as wild cards. Ferries need a rainbow card for each white dot on the route.
        </li>
        <li>
          <strong>Build a station:</strong> in any city that doesn't have one. Your first costs 1 card, the
          second 2, the third 3, all of one color (rainbows are wild).
        </li>
      </ul>

      <h4>Tunnels</h4>
      <p>
        After you lay down the cards, the top 3 cards of the deck are revealed. Each one matching the color you
        played, or any rainbow, costs one more card of that color (or a rainbow). If you paid only with
        rainbows, only revealed rainbows count, and you must pay them with rainbows. If you can't or
        won't pay, you take your cards back and your turn ends.
      </p>

      <h4>Parallel routes</h4>
      <p>
        One player can't claim both routes between the same two cities. With 2–3 players, only one of the pair
        can be claimed in the whole game.
      </p>

      <h4>End of game</h4>
      <p>
        When a player ends their turn with 2 or fewer trains, the last round begins: every player, including
        that one, gets one final turn.
      </p>

      <h4>Scoring</h4>
      <ul>
        <li>Routes: 1 train = 1 pt, 2 = 2, 3 = 4, 4 = 7, 6 = 15, 8 = 21.</li>
        <li>Destination tickets: add the points if your routes connect both cities; subtract them if not.</li>
        <li>
          Stations: each built station lets you use one route claimed by another player into or out of its city,
          only to complete your tickets. The same route counts for all your tickets. The best choice is made for
          you at the end.
        </li>
        <li>Each station you didn't build scores 4 points.</li>
        <li>
          European Express: 10 points for the longest continuous path (stations and borrowed routes don't count).
          Tied players all get it.
        </li>
        <li>
          Ties for the win go to the player with the most completed tickets, then the fewest stations built,
          then the European Express.
        </li>
      </ul>
    </details>
  );
}
