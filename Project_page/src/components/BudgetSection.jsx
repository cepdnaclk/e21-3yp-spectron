import "../styles/budget.css";
import { budgetItems } from "../data/budgetData.js";

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

        <div className="budget-table-shell">
          <table className="budget-table" aria-label={copy.tableLabel}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Item</th>
                <th scope="col">Model / Notes</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit Price (LKR)</th>
                <th scope="col">Total (LKR)</th>
              </tr>
            </thead>
            <tbody>
              {budgetItems.map((item, index) => (
                <tr key={`${item.item}-${item.model}`}>
                  <td>{index + 1}</td>
                  <td>{item.item}</td>
                  <td>{item.model}</td>
                  <td>{item.qty}</td>
                  <td>{item.unitPrice}</td>
                  <td>{item.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="5">Estimated Budget</td>
                <td>{copy.totalTableValue}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}

export default BudgetSection;
