'use client';

import { describeAutomation, removeAutomation, triggerSpec, updateAutomation, type Automation } from '@/lib/automations';
import { timeAgo } from '@/lib/relativeTime';
import Icon from '../ui/Icon';
import styles from './AutomationCard.module.scss';

export default function AutomationCard({ automation }: { automation: Automation }) {
  const spec = triggerSpec(automation.trigger);
  const on = automation.enabled;

  return (
    <li className={`${styles.card} ${on ? styles.on : ''}`}>
      <span className={`${styles.kind} ${styles[spec.notification]}`}>{spec.label}</span>
      <p className={styles.sentence}>
        {describeAutomation(automation)}, notify me{automation.action.system ? ' here and in the browser' : ''}.
      </p>
      <p className={styles.stat}>
        {automation.fired ? `Sent ${automation.fired === 1 ? 'once' : `${automation.fired} times`}` : 'Nothing sent yet'}
        {automation.lastFiredAt ? ` · last ${timeAgo(automation.lastFiredAt)}` : ''}
      </p>
      <div className={styles.controls}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={on ? 'Pause alert' : 'Resume alert'}
          className={styles.toggle}
          onClick={() => updateAutomation(automation.id, { enabled: !on })}
        >
          <span className={styles.track} aria-hidden="true" />
          {on ? 'On' : 'Paused'}
        </button>
        <button type="button" className={styles.remove} onClick={() => removeAutomation(automation.id)} aria-label="Delete alert">
          <Icon name="trash" size={17} />
        </button>
      </div>
    </li>
  );
}
