import { featureHighlights, featureWorkflow } from "../data/featuresData.js";
import "../styles/features.css";

const Icon = ({ name }) => {
  const icons = {
    modular: <path d="M7 7h4v4H7V7Zm6 0h4v4h-4V7Zm-6 6h4v4H7v-4Zm6 6v-6h4v6h-4ZM11 9h2M9 11v2M15 11v2M11 15h2" />,
    pairing: <path d="M8 12a4 4 0 0 1 4-4h2M16 8h-2M16 8v2M16 12a4 4 0 0 1-4 4h-2M8 16h2M8 16v-2" />,
    monitoring: <path d="M4 17h16M6 15l3-5 3 3 3-7 3 9" />,
    configuration: <path d="M12 4v3M12 17v3M6.6 6.6l2.1 2.1M15.3 15.3l2.1 2.1M4 12h3M17 12h3M6.6 17.4l2.1-2.1M15.3 8.7l2.1-2.1M10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />,
    alerts: <path d="M12 4 3.5 19h17L12 4Zm0 5v4M12 16h.01" />,
    ingestion: <path d="M5 7h5v5H5V7Zm9 5h5v5h-5v-5ZM10 9.5h4M12 9.5v5" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {icons[name] || icons.modular}
    </svg>
  );
};

function FeaturesSection({ copy }) {
  return (
    <section className="section features-section" id="features">
      <div className="container">
        <div className="features-section__header">
          <div>
            <p className="features-section__eyebrow">{copy.eyebrow}</p>
            <h2 className="section__title">{copy.title}</h2>
          </div>
          <p className="section__subtitle">{copy.subtitle}</p>
        </div>

        <div className="features-grid">
          {featureHighlights.map((feature) => (
            <article
              className={`feature-card feature-card--${feature.tone}`}
              key={feature.id}
            >
              <div className="feature-card__top">
                <span className="feature-card__icon">
                  <Icon name={feature.id} />
                </span>
                <span className="feature-card__metric">{feature.metric}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>

        <div className="features-workflow" aria-label="Spectron feature workflow">
          <div>
            <p className="features-section__eyebrow">{copy.workflowEyebrow}</p>
            <h3>{copy.workflowTitle}</h3>
          </div>
          <ol>
            {featureWorkflow.map((item, index) => (
              <li key={item}>
                <span>{index + 1}</span>
                <strong>{item}</strong>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default FeaturesSection;
