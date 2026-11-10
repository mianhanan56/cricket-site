import { PageHeader } from '../ui/Section';
import styles from './InfoPage.module.scss';

export function InfoPage({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <PageHeader eyebrow={eyebrow} title={title}>
        <p className={styles.lead}>{lead}</p>
      </PageHeader>
      <div className={styles.body}>{children}</div>
    </div>
  );
}

export function InfoSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      <div className={styles.prose}>{children}</div>
    </section>
  );
}
