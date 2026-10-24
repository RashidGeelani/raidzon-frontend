/** PLAYER = an accepted squad member: view-only, no phone numbers. */
export type TeamRole = 'OWNER' | 'MANAGER' | 'COACH' | 'PLAYER';
export type PlayingRole = 'RAIDER' | 'DEFENDER' | 'ALL_ROUNDER';
export type Leadership = 'CAPTAIN' | 'VICE_CAPTAIN';

export const REQUIRED_PLAYERS = 7;
export const RECOMMENDED_PLAYERS = 12;
export const MAX_SQUAD = 20;
export const MATCH_SUBSTITUTES = 5;

export interface TeamSummary {
  id: string;
  name: string;
  city: string | null;
  archived: boolean;
  myRole: TeamRole;
  /** Set when the viewer is this team's captain or vice-captain. */
  myLeadership?: Leadership | null;
  squadSize: number;
  captainName: string | null;
}
export interface TeamMember {
  id: string;
  /** The player's own name once they accepted the invitation, otherwise the organizer's squad name. */
  name: string;
  squadName: string;
  /** Null when the viewer is a player (players never see other people's numbers). */
  phone: string | null;
  jersey: number | null;
  playingRole: PlayingRole | null;
  leadership: Leadership | null;
  claimed: boolean;
  /** Added by phone but has not accepted yet. */
  invited?: boolean;
}
export interface TeamStaff {
  id: string;
  name: string;
  phone: string | null;
  role: 'MANAGER' | 'COACH';
  invited?: boolean;
}
/** A team that added the signed-in phone and is waiting for an answer. */
export interface TeamInvitation {
  teamId: string;
  teamName: string;
  city: string | null;
  ownerName: string | null;
  role: 'PLAYER' | 'MANAGER' | 'COACH';
  squadName: string;
}
export interface TeamDetail {
  id: string;
  name: string;
  city: string | null;
  archived: boolean;
  revision: number;
  myRole: TeamRole;
  ownerName: string | null;
  members: TeamMember[];
  staff: TeamStaff[];
}
