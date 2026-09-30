'use client';

import { useState } from 'react';
import { removeAutomation, useAutomations } from '@/lib/automations';
import { PageHeader, SectionHead } from '@/components/ui/Section';
import AlertCreator, { NEW_ALERT_ID } from '@/components/automations/AlertCreator';
import AutomationCard from '@/components/automations/AutomationCard';
import BrowserNotifications from '@/components/automations/BrowserNotifications';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import styles from './automations.module.scss';

const goToCreator = () => {
  const el = document.getElementById(NEW_ALERT_ID);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
};

export default function AutomationsView() {
  const automations = useAutomations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const active = automations.filter((a) => a.enabled).length;
  // Gone from the list (deleted here or in another tab) means there is nothing left to edit.
  const editing = automations.find((a) => a.id === editingId) ?? null;

  const edit = (id: string) => {
    setEditingId(id);
    setNotice(null);
    requestAnimationFrame(goToCreator);
  };

  const finishEdit = (message: string | null) => {
    setEditingId(null);
    setNotice(message);
  };

  const confirmDelete = () => {
    if (deletingId) removeAutomation(deletingId);
    if (deletingId === editingId) setEditingId(null);
    setDeletingId(null);
  };

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
          <AlertCreator key={editing?.id ?? 'new'} editing={editing} notice={notice} onDone={finishEdit} />
        </div>

        <aside className={styles.side}>
          <section>
            <SectionHead title="Your alerts" count={automations.length} level={3} />
            {automations.length ? (
              <ul className={styles.list}>
                {automations.map((a) => (
                  <AutomationCard
                    key={a.id}
                    automation={a}
                    editing={a.id === editing?.id}
                    onEdit={() => edit(a.id)}
                    onDelete={() => setDeletingId(a.id)}
                  />
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

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete this alert?"
        body="You will stop receiving notifications for this alert."
        confirmLabel="Delete alert"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
