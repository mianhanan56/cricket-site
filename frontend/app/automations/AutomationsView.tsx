'use client';

import { useState } from 'react';
import { useAutomations } from '@/lib/automations';
import { PageHeader, SectionHead } from '@/components/ui/Section';
import AlertCreator, { NEW_ALERT_ID } from '@/components/automations/AlertCreator';
import AutomationBuilder from '@/components/automations/AutomationBuilder';
import AutomationCard from '@/components/automations/AutomationCard';
import BrowserNotifications from '@/components/automations/BrowserNotifications';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import styles from './automations.module.scss';

const goToCreator = () => {
  const el = document.getElementById(NEW_ALERT_ID);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
};

export default function AutomationsView() {
  const automations = useAutomations();
  const [advanced, setAdvanced] = useState(false);
  const active = automations.filter((a) => a.enabled).length;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Notifications"
        title="Alerts"
        aside={
          <div className={styles.status}>
            <span className={`${styles.dot} ${active ? styles.dotOn : ''}`} aria-hidden="true" />
            <span className={styles.statusNum}>{active}</span>
            <span>active</span>
          </div>
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <AlertCreator />

          <div className={styles.advanced}>
            <button
              type="button"
              className={styles.advancedToggle}
              aria-expanded={advanced}
              aria-controls="advanced-builder"
              onClick={() => setAdvanced((v) => !v)}
            >
              <Icon name="settings" size={17} />
              Advanced options
              <Icon name="chevronDown" size={16} className={`${styles.chevron} ${advanced ? styles.chevronUp : ''}`} />
            </button>
            <div id="advanced-builder" hidden={!advanced}>
              <AutomationBuilder />
            </div>
          </div>
        </div>

        <aside className={styles.side}>
          <section>
            <SectionHead title="Your alerts" count={automations.length} level={3} />
            {automations.length ? (
              <ul className={styles.list}>
                {automations.map((a) => (
                  <AutomationCard key={a.id} automation={a} />
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon="bell"
                title="No alerts yet"
                body="Nothing will notify you until you set one up. Pick a moment, like a wicket or a fifty, and who it’s for."
                action={{ label: 'Create an alert', onClick: goToCreator }}
              />
            )}
          </section>

          <BrowserNotifications />
        </aside>
      </div>
    </div>
  );
}
