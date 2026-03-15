import NavBar from './components/NavBar';
import HeroSection from './components/HeroSection';
import WorkspaceCards from './components/WorkspaceCards';
import FeatureGrid from './components/FeatureGrid';
import FooterCTA from './components/FooterCTA';
import styles from './HomePage.module.css';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <NavBar />
      <HeroSection />
      <WorkspaceCards />
      <FeatureGrid />
      <FooterCTA />
    </div>
  );
}
