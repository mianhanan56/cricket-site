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
      <div className={styles.flow} aria-hidden="true">
        <span className={styles.chip}>When</span>
        <span className={styles.arrow} />
        <span className={styles.chip}>If</span>
        <span className={styles.arrow} />
        <span className={styles.chip}>Then</span>
      </div>
      <p className={styles.sentence}>{describeAutomation(automation)}, notify me{automation.action.system ? ' and raise a system alert' : ''}.</p>
      <div className={styles.meta}>
        <span className={`${styles.kind} ${styles[spec.notification]}`}>{spec.label}</span>
        <span className={styles.stat}>
          {automation.fired ? `Fired ${automation.fired}×` : 'Not fired yet'}
          {automation.lastFiredAt ? ` · last ${timeAgo(automation.lastFiredAt)}` : ''}
        </span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={on ? 'Pause automation' : 'Resume automation'}
          className={styles.toggle}
          onClick={() => updateAutomation(automation.id, { enabled: !on })}
        >
          <span className={styles.track} aria-hidden="true" />
          {on ? 'On' : 'Paused'}
        </button>
        <button type="button" className={styles.remove} onClick={() => removeAutomation(automation.id)} aria-label="Delete automation">
          <Icon name="trash" size={17} />
        </button>
      </div>
    </li>
  );
}
