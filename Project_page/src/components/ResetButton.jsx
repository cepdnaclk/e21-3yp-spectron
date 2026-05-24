function ResetButton({ label, onReset, disabled }) {
  return (
    <button
      className="reset-button"
      type="button"
      onClick={onReset}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export default ResetButton;
