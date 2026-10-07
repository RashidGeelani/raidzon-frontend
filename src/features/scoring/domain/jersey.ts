/** "#7 Waseem" for lists and messages; just the name for matches created before jersey numbers. */
export const withJersey = (player: { name: string; jersey?: number }) =>
  player.jersey === undefined ? player.name : `#${player.jersey} ${player.name}`;

/** The player in a team whose shirt carries this number, among the given candidates. */
export function byJersey<T extends { jersey?: number }>(players: T[], typed: string): T | undefined {
  if (!/^[0-9]{1,3}$/.test(typed.trim())) return undefined;
  const number = Number(typed.trim());
  return players.find((player) => player.jersey === number);
}
