import { api, type AccountSession } from '../../identity/data/auth-client';

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
/** A saved team's request to play in a tournament. Never includes player phones. */
export interface JoinRequest {
  id: string;
  tournamentId: string;
  tournamentName: string;
  teamId: string;
  teamName: string;
  teamCity: string | null;
  squadSize: number;
  players: string[];
  requestedByName: string | null;
  message: string | null;
  status: JoinRequestStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  tournamentTeamId: string | null;
}

export const STATUS_LABEL: Record<JoinRequestStatus, string> = {
  PENDING: 'Waiting for organizer',
  APPROVED: 'Approved',
  REJECTED: 'Not accepted',
  WITHDRAWN: 'Withdrawn',
};

export const requestToJoin = (account: AccountSession, tournamentId: string, teamId: string, message: string) =>
  api<JoinRequest>(`/tournaments/${tournamentId}/join-requests`, { id: crypto.randomUUID(), teamId, message: message.trim() || null }, account.token);
export const tournamentRequests = (account: AccountSession, tournamentId: string) =>
  api<JoinRequest[]>(`/tournaments/${tournamentId}/join-requests`, undefined, account.token);
export const teamRequests = (account: AccountSession, teamId: string) =>
  api<JoinRequest[]>(`/teams/${teamId}/join-requests`, undefined, account.token);
export const withdrawRequest = (account: AccountSession, requestId: string) =>
  api<JoinRequest>(`/join-requests/${requestId}/withdraw`, {}, account.token);
export const approveRequest = <T,>(account: AccountSession, requestId: string, note: string) =>
  api<T>(`/join-requests/${requestId}/approve`, { note: note.trim() || null }, account.token);
export const rejectRequest = (account: AccountSession, requestId: string, note: string) =>
  api<JoinRequest>(`/join-requests/${requestId}/reject`, { note: note.trim() || null }, account.token);
export const setRegistration = <T,>(account: AccountSession, tournamentId: string, open: boolean) =>
  api<T>(`/tournaments/${tournamentId}/registration`, { open }, account.token);

/** The latest request per team, so the newest status wins over older decided ones. */
export function latestByTeam(requests: JoinRequest[]) {
  const latest = new Map<string, JoinRequest>();
  for (const request of requests) {
    const current = latest.get(request.teamId);
    if (!current || request.createdAt > current.createdAt) latest.set(request.teamId, request);
  }
  return latest;
}
