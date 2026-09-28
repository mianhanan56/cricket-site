import type { Metadata } from 'next';
import AutomationsView from './AutomationsView';

export const metadata: Metadata = {
  title: 'Alerts',
  description: 'Cricket alerts for the moments you care about — match starts, wickets, fifties, hundreds and close chases.',
};

export default function AutomationsPage() {
  return <AutomationsView />;
}
