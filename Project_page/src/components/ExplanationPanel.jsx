import ResetButton from "./ResetButton.jsx";
import "../styles/architecture.css";

function ExplanationPanel({ activeItem, copy, onReset }) {
  const hasSelection = Boolean(activeItem);
  const badgeLabel = activeItem?.type ? copy.badges[activeItem.type] : null;

  return (
    <aside className="explanation-panel" aria-live="polite">
      <div className="explanation-panel__header">
        <h3>{copy.panelTitle}</h3>
        {badgeLabel ? (
          <span className="explanation-panel__badge">{badgeLabel}</span>
        ) : null}
      </div>
      <p className="explanation-panel__summary">
        {hasSelection ? activeItem.summary : copy.panelEmpty}
      </p>
      {hasSelection && activeItem.details?.length ? (
        <ul className="explanation-panel__list">
          {activeItem.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      {hasSelection && activeItem.tags?.length ? (
        <div className="explanation-panel__tags">
          {activeItem.tags.map((tag) => (
            <span key={tag} className="explanation-panel__tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <ResetButton
        label={copy.resetLabel}
        onReset={onReset}
        disabled={!hasSelection}
      />
    </aside>
  );
}

export default ExplanationPanel;
