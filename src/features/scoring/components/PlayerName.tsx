/** A player's name with their jersey number shown big in front, as scorers see it on the shirt. */
export function PlayerName({ player }: { player: { name: string; jersey?: number } }) {
  return (
    <>
      {player.jersey !== undefined && (
        <b className="jersey-badge" aria-hidden="true">
          {player.jersey}
        </b>
      )}
      {player.name}
    </>
  );
}
