import { testingGroups } from "../data/testingData.js";
import "../styles/testing.css";

const Icon = ({ name }) => {
  const icons = {
    chip: (
      <>
        <rect x="8" y="8" width="8" height="8" rx="1.5" />
        <path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3" />
      </>
    ),
    code: <path d="m9 7-5 5 5 5M15 7l5 5-5 5M13 5l-2 14" />,
    sensor: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M4.5 12a8.5 8.5 0 0 1 15 0 8.5 8.5 0 0 1-15 0Z" />
      </>
    ),
    wireless: <path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a5.7 5.7 0 0 1 8 0M11 18.5h2" />,
    signal: <path d="M5 19h3v-5H5v5ZM10.5 19h3v-9h-3v9ZM16 19h3V5h-3v14Z" />,
    battery: <path d="M4 9h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4V9Zm16 2h2v2h-2" />,
    api: <path d="M8 7h8M8 12h8M8 17h5M4 7h.01M4 12h.01M4 17h.01" />,
    pipeline: <path d="M5 7h5v5H5V7Zm9 5h5v5h-5v-5ZM10 9.5h4M12 9.5v5" />,
    dashboard: <path d="M4 5h16v14H4V5Zm3 4h5v7H7V9Zm8 0h2M15 13h2" />,
    load: <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {icons[name] || icons.sensor}
    </svg>
  );
};

function TestingSection({ copy }) {
  return (
    <section className="section testing-section" id="testing">
      <div className="container">
        <div className="testing-section__header">
          <h2 className="section__title">{copy.title}</h2>
          <p className="section__subtitle">{copy.subtitle}</p>
        </div>

        <div className="testing-grid">
          {testingGroups.map((group) => (
            <article className="testing-card" key={group.title}>
              <header className="testing-card__header">
                <span className="testing-card__icon">
                  <Icon name={group.icon} />
                </span>
                <h3>{group.title}</h3>
              </header>

              <ul className="testing-list">
                {group.items.map((item) => (
                  <li className="testing-list__item" key={item.label}>
                    <span className="testing-list__icon">
                      <Icon name={item.icon} />
                    </span>
                    <span className="testing-list__copy">
                      <span className="testing-list__label">{item.label}</span>
                      <strong className={`testing-status testing-status--${item.tone}`}>
                        {item.status}
                      </strong>
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TestingSection;
