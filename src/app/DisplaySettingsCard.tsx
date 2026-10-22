import { type ThemeChoice, updateDisplaySettings, useDisplaySettings } from './display-settings';

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Profile → Display: theme and sideline mode. Saved on this phone only, works signed out. */
export function DisplaySettingsCard() {
  const { sideline, theme } = useDisplaySettings();
  return (
    <section className="ui-card display-settings" aria-label="Display">
      <h3>Display</h3>
      <div className="theme-choice" role="group" aria-label="Theme">
        {THEMES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={theme === option.value ? 'on' : ''}
            aria-pressed={theme === option.value}
            onClick={() => updateDisplaySettings({ theme: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <small className="theme-note">Auto follows your phone's light or dark setting. Saved on this phone.</small>
      <label className="display-toggle">
        <input
          type="checkbox"
          role="switch"
          checked={sideline}
          onChange={(event) => updateDisplaySettings({ sideline: event.target.checked })}
        />
        <span>
          <strong>Sideline mode</strong>
          <small>Bigger text and buttons for scoring outdoors in bright light. Saved on this phone.</small>
        </span>
      </label>
    </section>
  );
}

/** Compact switch for the scoring header, so a scorer can turn it on mid-match. */
export function SidelineToggle() {
  const { sideline } = useDisplaySettings();
  return (
    <button
      type="button"
      className={`sideline-toggle ${sideline ? 'on' : ''}`}
      aria-pressed={sideline}
      aria-label="Sideline mode: bigger text and buttons"
      title="Sideline mode"
      onClick={() => updateDisplaySettings({ sideline: !sideline })}
    >
      Aa
    </button>
  );
}
