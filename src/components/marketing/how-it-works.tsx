const steps = ["Describe", "Outline", "Generate", "Export"];

export function HowItWorks() {
  return (
    <section className="landing-section">
      <div className="mx-auto max-w-[1080px] px-6">
        <h2 className="landing-heading">How it works</h2>

        <div className="landing-showcase-gradient mx-auto mt-10 max-w-[640px] rounded-[28px] px-6 py-10 sm:px-10">
          <div className="landing-pill-tabs mx-auto w-full justify-center">
            {steps.map((step, i) => (
              <span
                key={step}
                className={`landing-pill-tab flex-1 text-center sm:flex-none ${i === 2 ? "landing-pill-tab-active" : ""}`}
              >
                <span className="mr-1.5 text-[11px] opacity-60">{i + 1}.</span>
                {step}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
