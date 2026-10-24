import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, type AccountSession } from '../identity/data/auth-client';
import { normalizePhone } from '../matches/data/match-repository';
import {
  acceptInvitation,
  addMember,
  addStaff,
  archiveTeam,
  cachedTeams,
  createTeam,
  declineInvitation,
  editMember,
  getTeam,
  leaveTeam,
  listInvitations,
  refreshTeamCache,
  removeMember,
  removeStaff,
  roleTag,
  setLeadership,
  squadStatus,
  updateTeamDetails,
  MAX_SQUAD,
  type Leadership,
  type PlayingRole,
  type TeamDetail,
  type TeamInvitation,
  type TeamMember,
  type TeamRole,
  type TeamSummary,
} from './data/team-client';
import {
  STATUS_LABEL,
  teamRequests,
  withdrawRequest,
  type JoinRequest,
} from '../tournaments/data/join-requests';

const ROLE_LABEL: Record<PlayingRole, string> = {
  RAIDER: 'Raider',
  DEFENDER: 'Defender',
  ALL_ROUNDER: 'All-rounder',
};

export function TeamsScreen({
  account,
  online,
  focusTeamId,
}: {
  account: AccountSession;
  online: boolean;
  focusTeamId?: string;
}) {
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [offlineTeams, setOfflineTeams] = useState<TeamDetail[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [reload, setReload] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  // focusTeamId is "<teamId>#<nonce>" so tapping the same notification twice still opens it.
  // An empty team ID (an invitation alert) opens the list, where invitations are shown first.
  useEffect(() => {
    if (focusTeamId) setSelected(focusTeamId.split('#')[0] || null);
  }, [focusTeamId]);

  useEffect(() => {
    let active = true;
    void cachedTeams(account.accountId).then((rows) => active && setOfflineTeams(rows));
    if (!online) return;
    refreshTeamCache(account)
      .then((rows) => active && setTeams(rows))
      .catch(
        () =>
          active && setMessage('Unable to load your teams. Saved squads remain on this device.'),
      );
    listInvitations(account)
      .then((rows) => active && Array.isArray(rows) && setInvitations(rows))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [account, online, reload]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const team = await createTeam(account, name.trim(), city.trim());
      setName('');
      setCity('');
      setShowCreate(false);
      setSelected(team.id);
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create the team.');
    } finally {
      setBusy(false);
    }
  }

  async function answer(invitation: TeamInvitation, accept: boolean) {
    setBusy(true);
    setMessage('');
    try {
      if (accept) {
        await acceptInvitation(account, invitation.teamId);
        setInvitations((rows) => rows.filter((row) => row.teamId !== invitation.teamId));
        setSelected(invitation.teamId);
      } else {
        setInvitations(await declineInvitation(account, invitation.teamId));
      }
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to answer the invitation.');
    } finally {
      setBusy(false);
    }
  }

  if (selected)
    return (
      <TeamDetailView
        key={selected}
        account={account}
        online={online}
        teamId={selected}
        initial={offlineTeams.find((team) => team.id === selected) ?? null}
        onBack={() => {
          setSelected(null);
          setReload((value) => value + 1);
        }}
      />
    );

  const list: {
    id: string;
    name: string;
    city: string | null;
    role: string;
    leadership?: Leadership | null;
    size: number;
    captain: string | null;
    archived: boolean;
  }[] = teams
    ? teams.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        role: t.myRole,
        leadership: t.myLeadership,
        size: t.squadSize,
        captain: t.captainName,
        archived: t.archived,
      }))
    : offlineTeams.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        role: t.myRole,
        size: t.members.length,
        captain: t.members.find((m) => m.leadership === 'CAPTAIN')?.name ?? null,
        archived: t.archived,
      }));
  const createForm = (
    <form className="panel team-create" id="new-team-form" onSubmit={create}>
      <p className="eyebrow">NEW TEAM</p>
      <label>
        Team name
        <input
          required
          maxLength={60}
          value={name}
          disabled={!online || busy}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Valley Raiders"
        />
      </label>
      <label>
        City or village <small>(optional)</small>
        <input
          maxLength={60}
          value={city}
          disabled={!online || busy}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Srinagar"
        />
      </label>
      <div className="sync-controls">
        <button className="primary" disabled={!online || busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create team'}
        </button>
        {list.length > 0 && (
          <button type="button" className="secondary" onClick={() => setShowCreate(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
  return (
    <section className="teams-screen" aria-label="My teams">
      <header className="list-screen-heading">
        <h2>Teams</h2>
        <p>Your squads, ready for any match or tournament</p>
        {list.length > 0 && !showCreate && (
          <button
            type="button"
            className="primary team-new-button"
            disabled={!online}
            onClick={() => setShowCreate(true)}
          >
            + New team
          </button>
        )}
      </header>
      {!online && (
        <p className="field-note">You’re offline. Showing squads saved on this device.</p>
      )}
      {message && (
        <p role="status" className="error">
          {message}
        </p>
      )}
      {invitations.length > 0 && (
        <section className="panel team-invitations" aria-label="Team invitations">
          <div className="profile-section-title">
            <h3>Team invitations</h3>
            <span>Accept to show your name and Verified tag in the squad</span>
          </div>
          <div className="team-members">
            {invitations.map((invitation) => (
              <div className="join-request-row" key={invitation.teamId + invitation.role}>
                <span>
                  <strong>{invitation.teamName}</strong>
                  <small>
                    {[
                      `As ${roleTag(invitation.role).toLowerCase()} “${invitation.squadName}”`,
                      invitation.ownerName ? `by ${invitation.ownerName}` : null,
                      invitation.city,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
                <span className="team-member-actions">
                  <button
                    className="primary"
                    disabled={!online || busy}
                    onClick={() => void answer(invitation, true)}
                  >
                    Accept
                  </button>
                  <button
                    className="quiet"
                    disabled={!online || busy}
                    onClick={() => void answer(invitation, false)}
                  >
                    Decline
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {showCreate && list.length > 0 && createForm}
      {teams === null && online && !message ? (
        <p>Loading your teams…</p>
      ) : list.length === 0 ? (
        <div className="list-empty">No teams yet. Create one, then add your squad.</div>
      ) : (
        <div className="team-list">
          {list.map((team) => (
            <button
              key={team.id}
              className={`team-card ${team.archived ? 'team-archived' : ''}`}
              onClick={() => setSelected(team.id)}
            >
              <span className="team-badge" aria-hidden="true">
                {initials(team.name)}
              </span>
              <span className="team-card-body">
                <strong>{team.name}</strong>
                <small>
                  {[team.city, team.captain ? `C: ${team.captain}` : null]
                    .filter(Boolean)
                    .join(' · ') || 'No captain yet'}
                </small>
              </span>
              <span className="team-card-meta">
                <em>{team.archived ? 'Archived' : roleTag(team.role as TeamRole, team.leadership)}</em>
                <small>
                  {team.size}/{MAX_SQUAD}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      {list.length === 0 && (teams !== null || !online) && createForm}
    </section>
  );
}

function TeamDetailView({
  account,
  online,
  teamId,
  initial,
  onBack,
}: {
  account: AccountSession;
  online: boolean;
  teamId: string;
  initial: TeamDetail | null;
  onBack: () => void;
}) {
  const [team, setTeam] = useState<TeamDetail | null>(initial);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!online) return;
    let active = true;
    getTeam(account, teamId)
      .then((detail) => active && setTeam(detail))
      .catch(
        (error) =>
          active && setMessage(error instanceof Error ? error.message : 'Unable to load the team.'),
      );
    return () => {
      active = false;
    };
  }, [account, online, teamId]);

  async function run(work: () => Promise<TeamDetail>) {
    setBusy(true);
    setMessage('');
    try {
      setTeam(await work());
      return true;
    } catch (error) {
      setMessage(
        error instanceof ApiError || error instanceof Error ? error.message : 'Unable to save.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!team)
    return (
      <section className="teams-screen">
        <button className="tournament-back" onClick={onBack} aria-label="Back to teams">
          ←
        </button>
        <p>{message || 'Loading team…'}</p>
      </section>
    );

  const manages = team.myRole === 'OWNER' || team.myRole === 'MANAGER';
  const canEdit = online && !team.archived && manages;
  const isOwner = online && !team.archived && team.myRole === 'OWNER';
  const status = squadStatus(team.members.length);
  const captain = team.members.find((m) => m.leadership === 'CAPTAIN')?.id ?? '';
  const vice = team.members.find((m) => m.leadership === 'VICE_CAPTAIN')?.id ?? '';

  return (
    <section className="teams-screen team-detail" aria-label={`${team.name} squad`}>
      <div className="team-detail-head">
        <button className="tournament-back" onClick={onBack} aria-label="Back to teams">
          ←
        </button>
        <span className="team-badge" aria-hidden="true">
          {initials(team.name)}
        </span>
        <div>
          <h2>{team.name}</h2>
          <small>
            {[team.city, team.ownerName ? `Owner: ${team.ownerName}` : null]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </div>
        <em className="team-role">{team.archived ? 'Archived' : roleTag(team.myRole)}</em>
      </div>
      {!online && (
        <p className="field-note">
          Offline: showing the squad saved on this device. Changes need a connection.
        </p>
      )}
      {team.myRole === 'COACH' && !team.archived && (
        <p className="field-note">
          As coach you can view the squad and pick match-day lineups when starting a match.
        </p>
      )}
      {team.myRole === 'PLAYER' && (
        <p className="field-note">You’re in this squad. Only the owner and managers can change it.</p>
      )}
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}

      {canEdit &&
        (editingDetails ? (
          <DetailsForm
            team={team}
            busy={busy}
            onCancel={() => setEditingDetails(false)}
            onSave={async (name, city) => {
              if (await run(() => updateTeamDetails(account, team.id, name, city)))
                setEditingDetails(false);
            }}
          />
        ) : (
          <button className="secondary" onClick={() => setEditingDetails(true)}>
            Edit name / city
          </button>
        ))}

      <div
        className={`squad-status ${status.requiredMet ? 'squad-ok' : 'squad-short'}`}
        role="status"
      >
        {status.label}
      </div>

      <section className="panel" aria-label="Squad">
        <div className="profile-section-title">
          <h3>Squad</h3>
          <span>7 required · 5 more recommended · up to {MAX_SQUAD}</span>
        </div>
        {team.members.length === 0 && (
          <p className="field-note">No players yet. Add at least seven.</p>
        )}
        <div className="team-members">
          {team.members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              canEdit={canEdit}
              busy={busy}
              onSave={(edit) => run(() => editMember(account, team.id, member.id, edit))}
              onRemove={() => run(() => removeMember(account, team.id, member.id))}
            />
          ))}
        </div>
        {canEdit && !status.full && (
          <AddMemberForm busy={busy} onAdd={(m) => run(() => addMember(account, team.id, m))} />
        )}
        {canEdit && status.full && (
          <p className="field-note">
            The squad is full ({MAX_SQUAD} players). Remove a player to add another.
          </p>
        )}
      </section>

      <section className="panel" aria-label="Captain and vice-captain">
        <div className="profile-section-title">
          <h3>Leadership</h3>
          <span>Captain and vice-captain must be different players</span>
        </div>
        <LeadershipForm
          members={team.members}
          captain={captain}
          vice={vice}
          disabled={!canEdit || busy}
          onSave={(c, v) => run(() => setLeadership(account, team.id, c || null, v || null))}
        />
      </section>

      <section className="panel" aria-label="Team staff">
        <div className="profile-section-title">
          <h3>Staff</h3>
          <span>Managers edit the squad · coaches view and pick lineups</span>
        </div>
        <div className="team-members">
          <div className="team-member">
            <span className="player-avatar">★</span>
            <span className="team-member-name">
              <strong>{team.ownerName ?? 'Team owner'}</strong>
              <small>Owner</small>
            </span>
          </div>
          {team.staff.map((staff) => (
            <div className="team-member" key={staff.id}>
              <span className="player-avatar">{initials(staff.name)}</span>
              <span className="team-member-name">
                <strong>{staff.name}</strong>
                <small>
                  {staff.role === 'MANAGER' ? 'Manager' : 'Coach'}
                  {staff.invited && <b className="invite-tag">Invited</b>}
                  {staff.phone && (
                    <>
                      {' · '}
                      <MaskedPhone phone={staff.phone} />
                    </>
                  )}
                </small>
              </span>
              {isOwner && (
                <button
                  className="quiet"
                  disabled={busy}
                  aria-label={`Remove ${staff.name}`}
                  onClick={() =>
                    void run(() => removeStaff(account, team.id, staff.id))
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {isOwner && (
          <AddStaffForm busy={busy} onAdd={(s) => run(() => addStaff(account, team.id, s))} />
        )}
        {isOwner && (
          <p className="field-note">
            Staff get access after they sign in with the phone number you add and accept.
          </p>
        )}
      </section>

      {/* Withdrawing stays possible after archiving, so a pending request never gets stuck. */}
      <TeamRequests
        account={account}
        online={online}
        teamId={team.id}
        canEdit={online && manages}
      />

      {online && team.myRole !== 'OWNER' && (
        <div className="team-danger">
          {confirmLeave ? (
            <>
              <span>Leave {team.name}? The owner can add you again later.</span>
              <button className="secondary" disabled={busy} onClick={() => setConfirmLeave(false)}>
                Cancel
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  leaveTeam(account, team.id)
                    .then(onBack)
                    .catch((error) => {
                      setMessage(error instanceof Error ? error.message : 'Unable to leave the team.');
                      setBusy(false);
                    });
                }}
              >
                Leave team
              </button>
            </>
          ) : (
            <button className="quiet" onClick={() => setConfirmLeave(true)}>
              Leave team…
            </button>
          )}
        </div>
      )}

      {isOwner && (
        <div className="team-danger">
          {confirmArchive ? (
            <>
              <span>Archive {team.name}? The squad becomes read-only.</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setConfirmArchive(false)}
              >
                Cancel
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void run(() => archiveTeam(account, team.id)).then(() => setConfirmArchive(false))
                }
              >
                Archive team
              </button>
            </>
          ) : (
            <button className="quiet" onClick={() => setConfirmArchive(true)}>
              Archive team…
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TeamRequests({
  account,
  online,
  teamId,
  canEdit,
}: {
  account: AccountSession;
  online: boolean;
  teamId: string;
  canEdit: boolean;
}) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!online) return;
    let active = true;
    teamRequests(account, teamId)
      .then((rows) => {
        if (active && Array.isArray(rows)) setRequests(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [account, online, teamId]);
  if (requests.length === 0) return null;
  return (
    <section className="panel" aria-label="Tournament requests">
      <div className="profile-section-title">
        <h3>Tournament requests</h3>
        <span>Find tournaments on the Tournaments tab</span>
      </div>
      <div className="team-members">
        {requests.map((request) => (
          <div className={`join-request-row join-${request.status.toLowerCase()}`} key={request.id}>
            <span>
              <strong>{request.tournamentName}</strong>
              <small>
                {STATUS_LABEL[request.status]}
                {request.decisionNote ? ` · “${request.decisionNote}”` : ''}
              </small>
            </span>
            {canEdit && request.status === 'PENDING' && (
              <button
                className="quiet"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError('');
                  withdrawRequest(account, request.id)
                    .then((updated) =>
                      setRequests((rows) =>
                        rows.map((row) => (row.id === updated.id ? updated : row)),
                      ),
                    )
                    .catch((cause) =>
                      setError(cause instanceof Error ? cause.message : 'Unable to withdraw.'),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                Withdraw
              </button>
            )}
          </div>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function DetailsForm({
  team,
  busy,
  onSave,
  onCancel,
}: {
  team: TeamDetail;
  busy: boolean;
  onSave: (name: string, city: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [city, setCity] = useState(team.city ?? '');
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name.trim(), city.trim());
      }}
    >
      <label>
        Team name
        <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        City or village
        <input maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} />
      </label>
      <div className="sync-controls">
        <button className="primary" disabled={busy || !name.trim()}>
          Save
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function MemberRow({
  member,
  canEdit,
  busy,
  onSave,
  onRemove,
}: {
  member: TeamMember;
  canEdit: boolean;
  busy: boolean;
  onSave: (edit: {
    name: string;
    jersey: number | null;
    playingRole: PlayingRole | null;
  }) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [name, setName] = useState(member.squadName);
  const [jersey, setJersey] = useState(member.jersey?.toString() ?? '');
  const [role, setRole] = useState<PlayingRole | ''>(member.playingRole ?? '');
  if (editing)
    return (
      <form
        className="team-member team-member-edit"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            name: name.trim(),
            jersey: jersey === '' ? null : Number(jersey),
            playingRole: role || null,
          }).then((ok) => ok && setEditing(false));
        }}
      >
        <label>
          Squad name
          <input required maxLength={70} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Jersey
          <input
            type="number"
            min={0}
            max={999}
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
          />
        </label>
        <label>
          Role
          <RoleSelect value={role} onChange={setRole} />
        </label>
        <div className="sync-controls">
          <button className="primary" disabled={busy}>
            Save
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
        {member.claimed && member.name !== member.squadName && (
          <p className="field-note">
            This player set their own name ({member.name}); it is shown instead of your squad name.
          </p>
        )}
      </form>
    );
  return (
    <div className="team-member">
      <span className="player-avatar">{member.jersey ?? initials(member.name)}</span>
      <span className="team-member-name">
        <strong>
          {member.name}
          {member.leadership === 'CAPTAIN' && <b className="lead-badge">C</b>}
          {member.leadership === 'VICE_CAPTAIN' && <b className="lead-badge">VC</b>}
        </strong>
        <small>
          {[
            member.playingRole ? ROLE_LABEL[member.playingRole] : null,
            member.claimed ? 'Verified' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          {member.invited && <b className="invite-tag">Invited</b>}
          {member.phone && (
            <>
              {member.playingRole || member.claimed ? ' · ' : ''}
              <MaskedPhone phone={member.phone} />
            </>
          )}
        </small>
      </span>
      {canEdit && !confirmRemove && (
        <span className="team-member-actions">
          <button
            className="quiet"
            disabled={busy}
            onClick={() => setEditing(true)}
            aria-label={`Edit ${member.name}`}
          >
            Edit
          </button>
          <button
            className="quiet"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
            aria-label={`Remove ${member.name}`}
          >
            ×
          </button>
        </span>
      )}
      {canEdit && confirmRemove && (
        <span className="team-member-actions">
          <button className="danger" disabled={busy} onClick={onRemove}>
            Remove
          </button>
          <button className="quiet" onClick={() => setConfirmRemove(false)}>
            Keep
          </button>
        </span>
      )}
    </div>
  );
}

function AddMemberForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (m: {
    name: string;
    phone: string;
    jersey: number | null;
    playingRole: PlayingRole | null;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [jersey, setJersey] = useState('');
  const [role, setRole] = useState<PlayingRole | ''>('');
  const [error, setError] = useState('');
  return (
    <form
      className="team-add"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        let normalized: string;
        try {
          normalized = normalizePhone(phone);
        } catch (cause) {
          setError((cause as Error).message);
          return;
        }
        void onAdd({
          name: name.trim(),
          phone: normalized,
          jersey: jersey === '' ? null : Number(jersey),
          playingRole: role || null,
        }).then((ok) => {
          if (ok) {
            setName('');
            setPhone('');
            setJersey('');
            setRole('');
          }
        });
      }}
    >
      <p className="eyebrow">ADD PLAYER</p>
      <label>
        Name
        <input
          required
          maxLength={70}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
        />
      </label>
      <label>
        Mobile
        <input
          required
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile number"
        />
      </label>
      <label>
        Jersey <small>(optional)</small>
        <input
          type="number"
          min={0}
          max={999}
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
        />
      </label>
      <label>
        Role <small>(optional)</small>
        <RoleSelect value={role} onChange={setRole} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        + Add to squad
      </button>
      <p className="field-note">
        Indian numbers can omit +91. No OTP is sent; the player gets an invitation and shows as
        Verified with their own name once they accept.
      </p>
    </form>
  );
}

function AddStaffForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (s: { name: string; phone: string; role: 'MANAGER' | 'COACH' }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'MANAGER' | 'COACH'>('MANAGER');
  const [error, setError] = useState('');
  return (
    <form
      className="team-add"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        let normalized: string;
        try {
          normalized = normalizePhone(phone);
        } catch (cause) {
          setError((cause as Error).message);
          return;
        }
        void onAdd({ name: name.trim(), phone: normalized, role }).then((ok) => {
          if (ok) {
            setName('');
            setPhone('');
          }
        });
      }}
    >
      <p className="eyebrow">ADD STAFF</p>
      <label>
        Name
        <input required maxLength={70} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Mobile
        <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as 'MANAGER' | 'COACH')}>
          <option value="MANAGER">Manager</option>
          <option value="COACH">Coach</option>
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="secondary" disabled={busy}>
        + Add staff
      </button>
    </form>
  );
}

function LeadershipForm({
  members,
  captain,
  vice,
  disabled,
  onSave,
}: {
  members: TeamMember[];
  captain: string;
  vice: string;
  disabled: boolean;
  onSave: (captain: string, vice: string) => void;
}) {
  const [c, setC] = useState(captain);
  const [v, setV] = useState(vice);
  useEffect(() => {
    setC(captain);
    setV(vice);
  }, [captain, vice]);
  const same = !!c && c === v;
  return (
    <form
      className="team-leadership"
      onSubmit={(e) => {
        e.preventDefault();
        if (!same) onSave(c, v);
      }}
    >
      <label>
        Captain
        <select value={c} disabled={disabled} onChange={(e) => setC(e.target.value)}>
          <option value="">— None —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Vice-captain
        <select value={v} disabled={disabled} onChange={(e) => setV(e.target.value)}>
          <option value="">— None —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {same && (
        <p className="error" role="alert">
          Captain and vice-captain must be different players.
        </p>
      )}
      {!disabled && (
        <button className="secondary" disabled={same || (c === captain && v === vice)}>
          Save leadership
        </button>
      )}
    </form>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: PlayingRole | '';
  onChange: (value: PlayingRole | '') => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as PlayingRole | '')}>
      <option value="">—</option>
      <option value="RAIDER">Raider</option>
      <option value="DEFENDER">Defender</option>
      <option value="ALL_ROUNDER">All-rounder</option>
    </select>
  );
}

/** Shows only the last four digits until tapped, so a squad list can be shown around without exposing numbers. */
function MaskedPhone({ phone }: { phone: string | null }) {
  const [shown, setShown] = useState(false);
  if (!phone) return null;
  return (
    <button
      type="button"
      className="masked-phone"
      aria-label={shown ? `Hide number ${phone}` : 'Show phone number'}
      onClick={() => setShown((value) => !value)}
    >
      {shown ? phone : `•••• ${phone.replace(/\D/g, '').slice(-4)}`}
    </button>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}
