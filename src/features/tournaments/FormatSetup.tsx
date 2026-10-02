import { useEffect, useState } from 'react';
import { GroupBoard } from './GroupBoard';
import { FORMAT_LABELS, formatProblem, type FormatType, type TournamentFormat, type TournamentGroup } from './data/format-types';

const DESCRIPTIONS: Record<FormatType, string> = {
  LEAGUE: 'Everyone plays everyone once. Top of the table wins.',
  KNOCKOUT: 'Lose and you are out. Top seeds get byes when needed.',
  GROUPS_KNOCKOUT: 'Round robin in groups, then the best teams play knockouts.',
};

/** Organizer: choose the format, arrange groups or seeding, and generate fixtures. Locked after the first match. */
export function FormatSetup({
  format,
  groups,
  teamCount,
  fixtureCount,
  teamName,
  busy,
  online,
  onSaveFormat,
  onArrange,
  onGenerate,
}: {
  format: TournamentFormat;
  groups: TournamentGroup[];
  teamCount: number;
  fixtureCount: number;
  teamName: (id: string) => string;
  busy: boolean;
  online: boolean;
  onSaveFormat: (input: { type: FormatType; groupCount: number; advancePerGroup: number; thirdPlace: boolean }) => void;
  onArrange: (groups: TournamentGroup[]) => void;
  onGenerate: () => void;
}) {
  const [type, setType] = useState<FormatType>(format.type);
  const [groupCount, setGroupCount] = useState(format.groupCount);
  const [advance, setAdvance] = useState(format.advancePerGroup);
  const [thirdPlace, setThirdPlace] = useState(format.thirdPlace);
  useEffect(() => {
    setType(format.type);
    setGroupCount(format.groupCount);
    setAdvance(format.advancePerGroup);
    setThirdPlace(format.thirdPlace);
  }, [format.type, format.groupCount, format.advancePerGroup, format.thirdPlace]);

  const problem = formatProblem(type, groupCount, advance);
  const changed = type !== format.type || (type === 'GROUPS_KNOCKOUT' && (groupCount !== format.groupCount || advance !== format.advancePerGroup)) || (type !== 'LEAGUE' && thirdPlace !== format.thirdPlace);
  const locked = format.locked;
  const disabled = locked || busy || !online;
  const qualifiers = groupCount * advance;

  return (
    <section className="format-setup" aria-label="Tournament format">
      {locked && (
        <p className="format-locked" role="note">
          🔒 Format locked — a match has been played. Groups, seeding and fixtures can no longer change.
        </p>
      )}
      <div className="format-options" role="radiogroup" aria-label="Format">
        {(Object.keys(FORMAT_LABELS) as FormatType[]).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={type === option}
            className={`format-option ${type === option ? 'selected' : ''}`}
            disabled={disabled}
            onClick={() => setType(option)}
          >
            <strong>{FORMAT_LABELS[option]}</strong>
            <small>{DESCRIPTIONS[option]}</small>
          </button>
        ))}
      </div>
      {type === 'GROUPS_KNOCKOUT' && (
        <div className="format-settings">
          <label>
            Groups
            <select value={groupCount} disabled={disabled} onChange={(event) => setGroupCount(Number(event.target.value))}>
              {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Go through from each group
            <select value={advance} disabled={disabled} onChange={(event) => setAdvance(Number(event.target.value))}>
              {[1, 2, 4].map((n) => <option key={n} value={n}>Top {n}</option>)}
            </select>
          </label>
        </div>
      )}
      {type !== 'LEAGUE' && (
        <label className="format-toggle">
          <input type="checkbox" checked={thirdPlace} disabled={disabled} onChange={(event) => setThirdPlace(event.target.checked)} />
          <span>Third-place playoff<small>Semi-final losers play for 3rd</small></span>
        </label>
      )}
      <p className="field-note">
        {type === 'GROUPS_KNOCKOUT' && !problem
          ? `${qualifiers} teams reach the knockouts${qualifiers >= 4 ? ` (${qualifiers === 4 ? 'semi-finals' : qualifiers === 8 ? 'quarter-finals' : 'round of 16'})` : ' (final)'}. Knockout matches cannot end in a draw: a tie goes to five raids each.`
          : type === 'KNOCKOUT'
            ? 'Knockout matches cannot end in a draw: a tie goes to five raids each.'
            : type === 'LEAGUE'
              ? 'Win 3 points, draw 1, loss 0. Ties: points, then point difference, then scoring ratio.'
              : ''}
      </p>
      {problem && <p className="error" role="alert">{problem}</p>}
      {changed && (
        <button
          type="button"
          className="primary"
          disabled={disabled || !!problem}
          onClick={() => {
            if (fixtureCount && !window.confirm('Changing the format removes the current fixtures. Continue?')) return;
            onSaveFormat({ type, groupCount, advancePerGroup: advance, thirdPlace });
          }}
        >
          Save format
        </button>
      )}
      {!changed && format.type !== 'LEAGUE' && teamCount > 0 && (
        <>
          <h4 className="format-subtitle">{format.type === 'KNOCKOUT' ? 'Seeding' : 'Groups'}</h4>
          <p className="field-note">
            {format.type === 'KNOCKOUT'
              ? 'Drag teams to set the draw. Seed 1 and 2 can only meet in the final; top seeds get byes.'
              : 'Drag teams between groups, or tap a team and choose “Move here”.'}
          </p>
          <GroupBoard groups={groups} teamName={teamName} disabled={disabled} onChange={onArrange} />
        </>
      )}
      {!changed && (
        <div className="format-generate">
          <button
            type="button"
            className="primary"
            disabled={disabled || teamCount < 2}
            onClick={() => {
              if (fixtureCount && !window.confirm('Generate fixtures again? This replaces all current fixtures.')) return;
              onGenerate();
            }}
          >
            {format.generated ? 'Generate fixtures again' : 'Generate fixtures'}
          </button>
          <small>
            {teamCount < 2
              ? 'Add at least 2 teams first.'
              : format.generated
                ? 'Fixtures are ready in Matches. Change groups or seeding, then generate again.'
                : 'Creates every match for this format. You can set match times afterwards.'}
          </small>
        </div>
      )}
    </section>
  );
}
