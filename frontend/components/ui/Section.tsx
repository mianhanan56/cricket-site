import Link from 'next/link';
import Icon from './Icon';
import styles from './Section.module.scss';

export function SectionHead({
  title,
  id,
  count,
  action,
  children,
  end = false,
  level = 2,
}: {
  title: string;
  id?: string;
  count?: number;
  /** A real, readable link to the fuller view. */
  action?: { href: string; label: string };
  /** Controls that sit on the heading's line. */
  children?: React.ReactNode;
  /** Push the controls to the line's far end. */
  end?: boolean;
  level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className={styles.head}>
      <H id={id} className={level === 2 ? styles.title : styles.titleSm}>
        {title}
        {count !== undefined && <span className={styles.count}>{count}</span>}
      </H>
      {children && <div className={`${styles.controls} ${end ? styles.end : ''}`}>{children}</div>}
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
  asideClassName,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  aside?: React.ReactNode;
  asideClassName?: string;
}) {
  return (
    <header className={styles.page}>
      <div className={styles.pageMain}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1 className={styles.pageTitle}>{title}</h1>
        {children}
      </div>
      {aside && <div className={`${styles.pageAside} ${asideClassName ?? ''}`}>{aside}</div>}
    </header>
  );
}
