import Link from 'next/link';
import Icon from './Icon';
import styles from './Section.module.scss';

export function SectionHead({
  title,
  id,
  count,
  action,
  children,
  level = 2,
}: {
  title: string;
  id?: string;
  count?: number;
  /** A real, readable link to the fuller view. */
  action?: { href: string; label: string };
  /** Controls that sit on the heading's line. */
  children?: React.ReactNode;
  level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className={styles.head}>
      <H id={id} className={level === 2 ? styles.title : styles.titleSm}>
        {title}
        {count !== undefined && <span className={styles.count}>{count}</span>}
      </H>
      {children && <div className={styles.controls}>{children}</div>}
      {action && (
        <Link href={action.href} className={styles.action}>
          {action.label}
          <Icon name="arrowRight" size={16} />
        </Link>
      )}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className={styles.page}>
      <div className={styles.pageMain}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1 className={styles.pageTitle}>{title}</h1>
        {children}
      </div>
      {aside && <div className={styles.pageAside}>{aside}</div>}
    </header>
  );
}
