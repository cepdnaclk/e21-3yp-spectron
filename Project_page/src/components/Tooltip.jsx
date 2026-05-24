import "../styles/architecture.css";

function Tooltip({ label, children }) {
  return (
    <span className="tooltip" data-tooltip={label} aria-label={label}>
      {children}
    </span>
  );
}

export default Tooltip;
