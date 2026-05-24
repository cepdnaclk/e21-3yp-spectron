import {
  hardwareCapabilities,
  hardwareFlow,
  hardwareModules,
} from "../data/hardwareData.js";
import "../styles/hardware.css";

const Icon = ({ name }) => {
  const icons = {
    controller: (
      <path d="M4 7h16v10H4V7Zm3 3h2v4H7v-4Zm5 0h5M12 14h3M8 3v4M16 3v4M8 17v4M16 17v4" />
    ),
    loader: <path d="M6 4h12v5H6V4Zm0 11h12v5H6v-5Zm3-3h6M12 9v6" />,
    packager: <path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5v-9Zm7 3.5 7-3.5M12 11 5 7.5M12 11v9" />,
    payload: <path d="M7 15a5 5 0 1 1 10 0M9 15h6M12 5v3M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 4.9l-1.4 1.4" />,
    check: <path d="m5 12 4 4L19 6" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {icons[name] || icons.controller}
    </svg>
  );
};

function HardwareSection({ copy }) {
  return (
    <section className="section hardware-section" id="hardware">
      <div className="container">
        <div className="hardware-section__header">
          <h2 className="section__title">{copy.title}</h2>
          <p className="section__subtitle">{copy.subtitle}</p>
        </div>

        <div className="hardware-system-grid">
          <div className="hardware-flow-card" aria-label="Hardware data flow">
            <div className="hardware-flow-card__top">
              <span>{copy.flowEyebrow}</span>
              <strong>{copy.flowTitle}</strong>
            </div>
            <div className="hardware-flow">
              {hardwareFlow.map((item) => (
                <article className="hardware-flow__step" key={item.step}>
                  <span>{item.step}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="hardware-summary">
            <p className="hardware-summary__eyebrow">{copy.summaryEyebrow}</p>
            <h3>{copy.summaryTitle}</h3>
            <p>{copy.summaryText}</p>
            <ul>
              {hardwareCapabilities.map((item) => (
                <li key={item.title}>
                  <span>
                    <Icon name="check" />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <em>{item.text}</em>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="hardware-module-grid">
          {hardwareModules.map((module) => (
            <article className="hardware-module-card" key={module.id}>
              <div className="hardware-module-card__top">
                <span className="hardware-module-card__icon">
                  <Icon name={module.id} />
                </span>
                <div>
                  <p>{module.source}</p>
                  <h3>{module.title}</h3>
                </div>
              </div>
              <p className="hardware-module-card__text">{module.text}</p>
              <ul className="hardware-module-card__list">
                {module.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
              <div className="hardware-facts">
                {module.facts.map((fact) => (
                  <span className="hardware-fact" key={fact.label}>
                    <small>{fact.label}</small>
                    <strong>{fact.value}</strong>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HardwareSection;
