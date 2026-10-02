export type TeamRole = 'OWNER' | 'MANAGER' | 'COACH';
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
  squadSize: number;
  captainName: string | null;
}
export interface TeamMember {
  id: string;
  profileId: string;
  /** The player's own name when they have set one, otherwise the organizer's squad name. */
  name: string;
  squadName: string;
  phone: string;
  jersey: number | null;
  playingRole: PlayingRole | null;
  leadership: Leadership | null;
  claimed: boolean;
}
export interface TeamStaff {
  profileId: string;
  name: string;
  phone: string;
  role: 'MANAGER' | 'COACH';
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
