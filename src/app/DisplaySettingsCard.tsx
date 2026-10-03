import { updateDisplaySettings, useDisplaySettings } from './display-settings';

/** Profile → Display: sideline mode for scoring outdoors. Saved on this phone only. */
export function DisplaySettingsCard() {
  const { sideline } = useDisplaySettings();
  return (
    <section className="ui-card display-settings" aria-label="Display">
      <h3>Display</h3>
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
