function BrandLogo({ className = "", as: Component = "span" }) {
  const classes = ["brand-logo", className].filter(Boolean).join(" ");

  return (
    <Component className={classes} aria-label="Spectron Modular IoT Adapter Kit">
      <span className="brand-logo__mark" aria-hidden="true">
        S
      </span>
      <span className="brand-logo__copy">
        <span className="brand-logo__name">SPECTRON</span>
        <span className="brand-logo__tagline">Modular IoT Adapter Kit</span>
      </span>
    </Component>
  );
}

export default BrandLogo;
