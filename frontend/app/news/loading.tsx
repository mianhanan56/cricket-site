import Skeleton, { stagger } from '../../components/ui/Skeleton';
import { PageHeader } from '../../components/ui/Section';
import styles from './news.module.scss';
import list from '../../components/news/NewsList.module.scss';

const ROWS = Array.from({ length: 6 }, (_, i) => i);

export default function Loading() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading news">
      <PageHeader eyebrow="News" title="Latest news" />
      <div className={list.lead}>
        <Skeleton className={list.leadImage} />
        <div className={list.leadBody}>
          <Skeleton variant="title" width="90" />
          <Skeleton variant="title" width="60" />
          <Skeleton variant="body" width="100" />
          <Skeleton variant="text" width="40" />
        </div>
      </div>
      <ul className={`${list.grid} ${styles.list} ${stagger}`}>
        {ROWS.map((i) => (
          <li key={i} className={list.row}>
            <Skeleton className={list.thumb} />
            <div className={list.body}>
              <Skeleton variant="body" width={i % 2 ? '90' : '70'} />
              <Skeleton variant="body" width="50" />
              <Skeleton variant="text" width="30" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
