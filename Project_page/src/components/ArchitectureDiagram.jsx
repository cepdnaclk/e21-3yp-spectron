import Tooltip from "./Tooltip.jsx";
import "../styles/architecture.css";

const architectureImage = "/team/Solution.png";

function ArchitectureDiagram({ scenarios, activeItem, onSelect, copy }) {
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
              className={`mode-chip${isActive ? " is-active" : ""}`}
              type="button"
              onClick={() => onSelect("scenario", scenario)}
              aria-pressed={isActive}
            >
              <Tooltip label={scenario.tooltip}>{scenario.label}</Tooltip>
            </button>
          );
        })}
      </div>

      <figure className="solution-map">
        <img
          className="solution-map__image"
          src={architectureImage}
          alt={copy.diagramImageAlt}
        />
      </figure>
    </div>
  );
}

export default ArchitectureDiagram;
