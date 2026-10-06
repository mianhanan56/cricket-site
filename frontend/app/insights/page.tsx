import type { Metadata } from 'next';
import type { Match } from '@/types';
import { getCrexMatchList } from '@/lib/crex';
import InsightsView from './InsightsView';

export const metadata: Metadata = {
  title: 'Insights',
  description: 'Every live match read at once — equations, pulse, tight chases.',
};

// The first list arrives with the page; the client poll replaces it within a second.
export const revalidate = 15;

export default async function InsightsPage() {
  const initial: Match[] = await getCrexMatchList({ revalidate }).catch(() => []);
  return <InsightsView initial={initial} />;
}
