'use client';

import { scopeLabel, summarizeTriggers, updateAutomation, type Automation } from '@/lib/automations';
import { timeAgo } from '@/lib/relativeTime';
import Icon from '../ui/Icon';
import styles from './AutomationCard.module.scss';

export default function AutomationCard({
  automation,
  editing,
  onEdit,
  onDelete,
}: {
  automation: Automation;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const on = automation.enabled;
  const title = summarizeTriggers(automation);

  return (
    <li className={`${styles.card} ${on ? styles.on : ''} ${editing ? styles.editing : ''}`}>
      <p className={styles.title}>{title}</p>
      <p className={styles.who}>{scopeLabel(automation.scope)}</p>
      <p className={styles.meta}>
        {automation.action.system ? 'In the app and browser' : 'In the app'}
        {' · '}
        {automation.fired ? `sent ${automation.fired === 1 ? 'once' : `${automation.fired} times`}` : 'nothing sent yet'}
        {automation.lastFiredAt ? `, last ${timeAgo(automation.lastFiredAt)}` : ''}
      </p>
      <div className={styles.controls}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${title}: ${on ? 'pause' : 'resume'}`}
          className={styles.toggle}
          onClick={() => updateAutomation(automation.id, { enabled: !on })}
        >
          <span className={styles.track} aria-hidden="true" />
          {on ? 'On' : 'Paused'}
        </button>
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={onEdit} aria-pressed={editing} aria-label={`Edit ${title}`}>
            <Icon name="edit" size={16} />
            Edit
          </button>
          <button type="button" className={`${styles.action} ${styles.remove}`} onClick={onDelete} aria-label={`Delete ${title}`}>
            <Icon name="trash" size={16} />
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
