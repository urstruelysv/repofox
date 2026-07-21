import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero-new";
import { DemoVideo } from "@/components/sections/demo-video";
import { WorksEverywhere } from "@/components/sections/works-everywhere";
import { Positioning } from "@/components/sections/positioning";
import { Pipeline } from "@/components/sections/pipeline";
import { Features } from "@/components/sections/features";
import { FAQSection } from "@/components/sections/faq-section";
import { FinalCTA } from "@/components/sections/final-cta";
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh" }}>
      <Navbar />
      <Hero />
      <DemoVideo />
      <WorksEverywhere />
      <Positioning />
      <Pipeline />
      <Features />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}
