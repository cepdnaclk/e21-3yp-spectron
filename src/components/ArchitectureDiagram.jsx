import Tooltip from "./Tooltip.jsx";
import "../styles/architecture.css";

function ArchitectureDiagram({
  scenarios,
  flow,
  activeItem,
  onSelect,
  copy,
}) {
  const activeScenarioNodes =
    activeItem?.type === "scenario" ? activeItem.relatedNodes : [];

  return (
    <div className="architecture-diagram">
      <div className="architecture-header">
        <div>
          <p className="architecture__eyebrow">{copy.modesTitle}</p>
          <h3 className="architecture__title">{copy.flowTitle}</h3>
        </div>
      </div>

      <div className="architecture-modes" role="list">
        {scenarios.map((scenario) => {
          const isActive =
            activeItem?.type === "scenario" && activeItem.id === scenario.id;

          return (
            <button
              key={scenario.id}
              className={`mode-card${isActive ? " is-active" : ""}`}
              type="button"
              onClick={() => onSelect("scenario", scenario)}
              aria-pressed={isActive}
            >
              <span className="mode-card__title">
                <Tooltip label={scenario.tooltip}>{scenario.label}</Tooltip>
              </span>
              <span className="mode-card__desc">{scenario.short}</span>
            </button>
          );
        })}
      </div>

      <div className="architecture-flow" role="list">
        {flow.map((node, index) => {
          const isActive =
            activeItem?.type === "flow" && activeItem.id === node.id;
          const isLinked = activeScenarioNodes.includes(node.id);

          return (
            <div className="flow-step" key={node.id}>
              <button
                className={`flow-node${isActive ? " is-active" : ""}${
                  isLinked ? " is-linked" : ""
                }`}
                type="button"
                onClick={() => onSelect("flow", node)}
                aria-pressed={isActive}
              >
                <span className="flow-node__label">
                  <Tooltip label={node.tooltip}>{node.label}</Tooltip>
                </span>
                <span className="flow-node__meta">{node.title}</span>
              </button>
              {index < flow.length - 1 ? (
                <span className="flow-arrow" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ArchitectureDiagram;
