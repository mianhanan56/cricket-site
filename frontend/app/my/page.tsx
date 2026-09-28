import type { Metadata } from 'next';
import MyCricketView from './MyCricketView';

export const metadata: Metadata = { title: 'My Cricket' };

export default function MyCricketPage() {
  return <MyCricketView />;
}
