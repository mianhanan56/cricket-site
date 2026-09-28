import type { Metadata } from 'next';
import InsightsView from './InsightsView';

export const metadata: Metadata = {
  title: 'Insights',
  description: 'Every live match read at once — equations, pulse, tight chases.',
};

export default function InsightsPage() {
  return <InsightsView />;
}
