import "../styles/budget.css";

const budgetImage = `${import.meta.env.BASE_URL}team/budget.png`;

function BudgetSection({ copy }) {
  return (
    <section className="section budget-section" id="budget">
      <div className="container">
        <div className="budget-section__header">
          <div>
            <p className="budget-section__eyebrow">{copy.eyebrow}</p>
            <h2 className="section__title">{copy.title}</h2>
            <p className="section__subtitle">{copy.subtitle}</p>
          </div>
          <div className="budget-section__total">
            <span>{copy.totalLabel}</span>
            <strong>{copy.totalValue}</strong>
          </div>
        </div>

        <figure className="budget-card">
          <img
            className="budget-card__image"
            src={budgetImage}
            alt={copy.imageAlt}
          />
        </figure>
      </div>
    </section>
  );
}

export default BudgetSection;
