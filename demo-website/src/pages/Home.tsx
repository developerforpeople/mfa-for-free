import { ArchitectureSection } from '@/components/sections/ArchitectureSection';
import { DeveloperSection } from '@/components/sections/DeveloperSection';
import { FeaturesSection } from '@/components/sections/FeaturesSection';
import { HeroSection } from '@/components/sections/HeroSection';

/**
 * The public landing page, at `/`.
 *
 * Pages compose sections and nothing else - no data fetching, no state, no
 * layout tweaks. That is what keeps a route file readable at a glance.
 */
export function Home() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <ArchitectureSection />
      <DeveloperSection />
    </>
  );
}
