'use client';

import { useEffect, useState } from 'react';
import { TEMPLATES, addAutomation, describeAutomation, useAutomations } from '@/lib/automations';
import { requestSystemPermission, systemPermission, type SystemPermission } from '@/lib/notifications';
import { openOverlay } from '@/lib/uiState';
import { PageHeader, SectionHead } from '@/components/ui/Section';
import AutomationBuilder from '@/components/automations/AutomationBuilder';
import AutomationCard from '@/components/automations/AutomationCard';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import styles from './automations.module.scss';

const PERMISSION_TEXT: Record<SystemPermission, string> = {
  granted: 'System alerts are allowed',
  default: 'System alerts are off',
  denied: 'System alerts are blocked in this browser',
  unsupported: 'This browser has no system alerts',
};

export default function AutomationsView() {
  const automations = useAutomations();
  const [permission, setPermission] = useState<SystemPermission>('unsupported');
  useEffect(() => setPermission(systemPermission()), []);

  const active = automations.filter((a) => a.enabled).length;
  const unused = TEMPLATES.filter(
    (t) => !automations.some((a) => a.trigger === t.trigger && a.scope.kind === t.scope.kind)
  );

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Pulse automations"
        title="Automations"
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
          <AutomationBuilder />

          {unused.length > 0 && (
            <section className={styles.section}>
              <SectionHead title="One tap" level={3} />
              <ul className={styles.templates}>
                {unused.map((t) => (
                  <li key={`${t.trigger}-${t.scope.kind}`}>
                    <button
                      type="button"
                      className={styles.template}
                      onClick={() => addAutomation({ ...t, action: { inApp: true, system: false } })}
                    >
                      <Icon name="plus" size={16} />
                      {describeAutomation(t)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className={styles.side}>
          <section>
            <SectionHead title="Your automations" count={automations.length} level={3} />
            {automations.length ? (
              <ul className={styles.list}>
                {automations.map((a) => (
                  <AutomationCard key={a.id} automation={a} />
                ))}
              </ul>
            ) : (
              <EmptyState compact icon="bolt" title="No automations yet" body="Use the builder, or add a ready-made rule in one tap." />
            )}
          </section>

          <section className={styles.settings}>
            <SectionHead title="Delivery" level={3} />
            <dl className={styles.settingList}>
              <div>
                <dt>In-app</dt>
                <dd>
                  Every alert lands in the notification center.
                  <button type="button" className={styles.inline} onClick={() => openOverlay('notifications')}>
                    Open it
                  </button>
                </dd>
              </div>
              <div>
                <dt>System</dt>
                <dd>
                  {PERMISSION_TEXT[permission]}
                  {permission === 'default' && (
                    <button
                      type="button"
                      className={styles.inline}
                      onClick={async () => setPermission(await requestSystemPermission())}
                    >
                      Allow
                    </button>
                  )}
                </dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>Alerts fire while PulseCrease is open in a tab.</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
