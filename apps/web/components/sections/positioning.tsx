import React from "react";

export function Positioning() {
  return (
    <section className="py-24 px-6 text-center bg-white">
      <div className="max-w-[800px] mx-auto">
        <p className="text-[clamp(22px,4vw,38px)] font-medium tracking-[-1.9px] leading-[1.3] text-pop-black">
          <span className="text-pop-muted">Finish the change.</span>{" "}
          <span className="text-pop-black">
            RepoFox prepares it for review.
          </span>
        </p>
        <p className="mt-5 text-[15px] text-pop-muted max-w-[480px] mx-auto leading-relaxed tracking-[-0.45px]">
          A guided Git workflow inside VS Code that keeps you in control from
          branch name to editable PR draft.
        </p>
      </div>
    </section>
  );
}
