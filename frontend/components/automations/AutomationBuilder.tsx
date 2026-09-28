'use client';

import { useEffect, useState } from 'react';
import {
  TRIGGERS,
  addAutomation,
  describeAutomation,
  triggerSpec,
  type AutomationScope,
  type ScopeKind,
  type TriggerKind,
} from '@/lib/automations';
import { requestSystemPermission, systemPermission, type SystemPermission } from '@/lib/notifications';
import Icon, { type IconName } from '../ui/Icon';
import EntityPicker, { type PickedEntity } from './EntityPicker';
import styles from './AutomationBuilder.module.scss';

const TRIGGER_ICON: Record<TriggerKind, IconName> = {
  MATCH_START: 'live',
  WICKET: 'flag',
  SIX: 'bolt',
  FOUR: 'arrowRight',
  FIFTY: 'star',
  HUNDRED: 'trophy',
  CLOSE_CHASE: 'signal',
  STOPPAGE: 'cloud',
  RESULT: 'check',
  TOURNAMENT_MILESTONE: 'rankings',
};

const SCOPE_LABEL: Record<ScopeKind, string> = {
  ANY: 'Any match',
  FOLLOWED: 'My teams',
  TEAM: 'A team',
  SERIES: 'A series',
  PLAYER: 'A player',
};

export default function AutomationBuilder({ onCreated }: { onCreated?: () => void }) {
  const [trigger, setTrigger] = useState<TriggerKind>('WICKET');
  const [scopeKind, setScopeKind] = useState<ScopeKind>('FOLLOWED');
  const [entity, setEntity] = useState<PickedEntity | null>(null);
  const [system, setSystem] = useState(false);
  const [saved, setSaved] = useState(false);
  const [perm, setPerm] = useState<SystemPermission>('unsupported');
  useEffect(() => setPerm(systemPermission()), []);

  const spec = triggerSpec(trigger);
  const scopes = spec.scopes;
  const kind = scopes.includes(scopeKind) ? scopeKind : scopes[0];
  const needsEntity = kind === 'TEAM' || kind === 'SERIES' || kind === 'PLAYER';
  const scope: AutomationScope = needsEntity ? { kind, id: entity?.id, name: entity?.name } : { kind };
  const ready = spec.available && (!needsEntity || Boolean(entity));

  const pickTrigger = (next: TriggerKind) => {
    setTrigger(next);
    setSaved(false);
    const allowed = triggerSpec(next).scopes;
    if (!allowed.includes(scopeKind)) {
      setScopeKind(allowed[0]);
      setEntity(null);
    }
  };

  const toggleSystem = async () => {
    if (system) return setSystem(false);
    const next = perm === 'default' ? await requestSystemPermission() : perm;
    setPerm(next);
    setSystem(next === 'granted');
  };

  const create = () => {
    if (!ready) return;
    addAutomation({ trigger, scope, action: { inApp: true, system } });
    setSaved(true);
    setEntity(null);
    onCreated?.();
  };

  return (
    <section className={styles.builder} aria-labelledby="builder-title">
      <h2 id="builder-title" className={styles.title}>
        New automation
      </h2>

      <ol className={styles.flow}>
        <li className={styles.step}>
          <span className={styles.node} aria-hidden="true" />
          <div className={styles.stepBody}>
            <span className={styles.stepLabel}>When</span>
            <div className={styles.triggers} role="radiogroup" aria-label="Trigger">
              {TRIGGERS.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  role="radio"
                  aria-checked={trigger === t.kind}
                  disabled={!t.available}
                  className={`${styles.trigger} ${trigger === t.kind ? styles.on : ''}`}
                  onClick={() => pickTrigger(t.kind)}
                >
                  <Icon name={TRIGGER_ICON[t.kind]} size={17} />
                  <span>{t.label}</span>
                  {!t.available && <span className={styles.soon}>Soon</span>}
                </button>
              ))}
            </div>
          </div>
        </li>

        <li className={styles.step}>
          <span className={styles.node} aria-hidden="true" />
          <div className={styles.stepBody}>
            <span className={styles.stepLabel}>If</span>
            <div className={styles.scopes} role="radiogroup" aria-label="Condition">
              {scopes.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={kind === s}
                  className={`${styles.scope} ${kind === s ? styles.on : ''}`}
                  onClick={() => {
                    setScopeKind(s);
                    setEntity(null);
                    setSaved(false);
                  }}
                >
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
            {needsEntity && <EntityPicker kind={kind as 'TEAM' | 'SERIES' | 'PLAYER'} value={entity} onChange={setEntity} />}
          </div>
        </li>

        <li className={styles.step}>
          <span className={styles.node} aria-hidden="true" />
          <div className={styles.stepBody}>
            <span className={styles.stepLabel}>Then</span>
            <div className={styles.actions}>
              <span className={`${styles.action} ${styles.on}`}>
                <Icon name="bell" size={17} />
                Notify me here
                <Icon name="check" size={15} className={styles.actionCheck} />
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={system}
                className={`${styles.action} ${system ? styles.on : ''}`}
                onClick={toggleSystem}
                disabled={perm === 'unsupported' || perm === 'denied'}
              >
                <Icon name="signal" size={17} />
                Also as a system alert
                <span className={styles.switch} aria-hidden="true" />
              </button>
            </div>
          </div>
        </li>
      </ol>

      <div className={styles.footer}>
        <p className={styles.sentence} aria-live="polite">
          {describeAutomation({ trigger, scope })}
          {needsEntity && !entity ? '…' : ', notify me.'}
        </p>
        <button type="button" className={styles.create} onClick={create} disabled={!ready}>
          <Icon name={saved ? 'check' : 'plus'} size={17} />
          {saved ? 'Automation on' : 'Create automation'}
        </button>
      </div>
    </section>
  );
}
