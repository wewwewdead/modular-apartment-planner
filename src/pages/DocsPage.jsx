import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NavBar from './components/NavBar';
import readmeRaw from '../../README.md?raw';
import styles from './DocsPage.module.css';

// Only render the user-facing product docs on this page.
// Everything from "## Install & Run" onward (install steps, tech stack,
// project structure, contributing, license) lives in the GitHub README
// but is not useful on the in-app docs page.
const devSectionStart = readmeRaw.indexOf('## Install & Run');
const publicContent = devSectionStart === -1 ? readmeRaw : readmeRaw.slice(0, devSectionStart);

// Strip HTML comments (e.g. screenshot placeholders) so they don't leak into the rendered page.
const readmeContent = publicContent
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/\n---\s*$/, '')
  .trim();

export default function DocsPage() {
  return (
    <div className={styles.page}>
      <NavBar />
      <main className={styles.main}>
        <div className={styles.header}>
          <Link to="/" className={styles.back}>
            &larr; Back to home
          </Link>
          <span className={styles.eyebrow}>Documentation</span>
          <h1 className={styles.title}>
            <span className={styles.titleDisplay}>Two tools, one browser,</span>
            <span className={styles.titleStructural}>documented end to end</span>
          </h1>
          <p className={styles.subtitle}>
            Feature reference, keyboard shortcuts, and exports for the Floorplan Editor and Craftsman Studio.
          </p>
        </div>
        <article className={styles.prose}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeContent}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
