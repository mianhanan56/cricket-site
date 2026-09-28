'use client';

import { useState } from 'react';
import {
  TRIGGERS,
  addAutomation,
  describeAutomation,
  triggerSpec,
  type AutomationScope,
  type ScopeKind,
  type TriggerKind,
} from '@/lib/automations';
import Icon from '../ui/Icon';
import EntityPicker, { type PickedEntity } from './EntityPicker';
import { SCOPE_LABEL, TRIGGER_ICON } from './alertOptions';
import { useNotificationPermission } from './useNotificationPermission';
import styles from './AutomationBuilder.module.scss';

export default function AutomationBuilder({ onCreated }: { onCreated?: () => void }) {
  const [trigger, setTrigger] = useState<TriggerKind>('WICKET');
  const [scopeKind, setScopeKind] = useState<ScopeKind>('FOLLOWED');
  const [entity, setEntity] = useState<PickedEntity | null>(null);
  const [wantSystem, setWantSystem] = useState(false);
  const [saved, setSaved] = useState(false);
  const [perm, requestPermission] = useNotificationPermission();
  const system = wantSystem && perm === 'granted';

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
    if (system) return setWantSystem(false);
    const next = perm === 'default' ? await requestPermission() : perm;
    setWantSystem(next === 'granted');
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
        Advanced alert builder
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
                disabled={!perm || perm === 'unsupported' || perm === 'denied'}
              >
                <Icon name="signal" size={17} />
                Also as a browser notification
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
          {saved ? 'Alert created' : 'Create alert'}
        </button>
      </div>
    </section>
  );
}
