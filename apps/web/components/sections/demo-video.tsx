export function DemoVideo() {
  return (
    <section className="bg-white py-24 px-6 border-t border-pop-border">
      <div className="max-w-[1120px] mx-auto">
        <div className="mb-12 text-center">
          <h2 className="text-[clamp(26px,3.5vw,38px)] font-medium tracking-[-1.9px] leading-[1.1] text-pop-black">
            See it work
          </h2>
        </div>
        <video
          controls
          className="w-full rounded-2xl border border-pop-border shadow-pop bg-pop-gray-100"
        >
          {/* Source URL to be supplied */}
        </video>
      </div>
    </section>
  );
}
