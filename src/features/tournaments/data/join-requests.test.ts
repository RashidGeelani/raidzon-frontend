import { describe, expect, it } from 'vitest';
import { latestByTeam, type JoinRequest } from './join-requests';

const request = (id: string, teamId: string, status: JoinRequest['status'], createdAt: string): JoinRequest => ({
  id, teamId, status, createdAt, tournamentId: 't', tournamentName: 'Cup', teamName: teamId, teamCity: null, squadSize: 7,
  players: [], requestedByName: null, message: null, decisionNote: null, decidedAt: null, tournamentTeamId: null,
});

describe('join request status', () => {
  it('keeps the newest request per team so a fresh request replaces an old rejection', () => {
    const latest = latestByTeam([
      request('old', 'tigers', 'REJECTED', '2026-10-01T10:00:00Z'),
      request('new', 'tigers', 'PENDING', '2026-10-02T10:00:00Z'),
      request('l', 'lions', 'APPROVED', '2026-10-01T09:00:00Z'),
    ]);
    expect(latest.get('tigers')?.id).toBe('new');
    expect(latest.get('lions')?.status).toBe('APPROVED');
    expect(latest.size).toBe(2);
  });
});
