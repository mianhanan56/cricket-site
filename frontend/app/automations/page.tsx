import type { Metadata } from 'next';
import AutomationsView from './AutomationsView';

export const metadata: Metadata = {
  title: 'Automations',
  description: 'Cricket alerts that fire on their own — wickets, starts, milestones, tight chases.',
};

export default function AutomationsPage() {
  return <AutomationsView />;
}
