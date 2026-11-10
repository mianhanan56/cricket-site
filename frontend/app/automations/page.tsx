import { pageMeta } from '@/lib/seo';
import AutomationsView from './AutomationsView';

export const metadata = pageMeta({
  title: 'Alerts',
  description: 'Cricket alerts for the moments you care about — match starts, wickets, fifties, hundreds and close chases.',
  path: '/automations',
  noindex: true,
});

export default function AutomationsPage() {
  return <AutomationsView />;
}
