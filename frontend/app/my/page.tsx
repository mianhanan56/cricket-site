import { pageMeta } from '@/lib/seo';
import MyCricketView from './MyCricketView';

export const metadata = pageMeta({ title: 'My Cricket', path: '/my', noindex: true });

export default function MyCricketPage() {
  return <MyCricketView />;
}
