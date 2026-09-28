'use client';

import { useState } from 'react';
import {
  addAutomation,
  describeAutomation,
  triggerSpec,
  useAutomations,
  type AutomationScope,
  type ScopeKind,
  type TriggerKind,
} from '@/lib/automations';
import { useFollows } from '@/lib/follows';
import type { SystemPermission } from '@/lib/notifications';
import Icon from '../ui/Icon';
import EntityPicker, { type PickedEntity } from './EntityPicker';
import { PRESETS, SCOPE_LABEL, TRIGGER_ICON } from './alertOptions';
import { useNotificationPermission } from './useNotificationPermission';
import styles from './AlertCreator.module.scss';

const BROWSER_NOTE: Partial<Record<SystemPermission, string>> = {
  denied: 'Blocked for this site',
  unsupported: 'Not supported in this browser',
};

export const NEW_ALERT_ID = 'new-alert';

export default function AlertCreator() {
  const automations = useAutomations();
  const follows = useFollows();
  const [permission, requestPermission] = useNotificationPermission();
  const [trigger, setTrigger] = useState<TriggerKind>('WICKET');
  const [scopeKind, setScopeKind] = useState<ScopeKind | null>(null);
  const [entity, setEntity] = useState<PickedEntity | null>(null);
  const [browser, setBrowser] = useState(false);
  const [created, setCreated] = useState(false);

  const scopes = triggerSpec(trigger).scopes;
  const preferred = scopeKind ?? (follows.teams.length || follows.series.length ? 'FOLLOWED' : 'ANY');
  const kind = scopes.includes(preferred) ? preferred : scopes[0];
  const needsEntity = kind === 'TEAM' || kind === 'SERIES' || kind === 'PLAYER';
  const scope: AutomationScope = needsEntity ? { kind, id: entity?.id, name: entity?.name } : { kind };
  const system = browser && permission === 'granted';
  const duplicate = automations.some((a) => a.trigger === trigger && a.scope.kind === kind && a.scope.id === scope.id);
  const ready = (!needsEntity || Boolean(entity)) && !duplicate;

  const pickTrigger = (next: TriggerKind) => {
    setTrigger(next);
    setCreated(false);
    if (!triggerSpec(next).scopes.includes(kind)) {
      setScopeKind(null);
      setEntity(null);
    }
  };

  const pickScope = (next: ScopeKind) => {
    setScopeKind(next);
    setEntity(null);
    setCreated(false);
  };

  const pickEntity = (next: PickedEntity | null) => {
    setEntity(next);
    setCreated(false);
  };

  const toggleBrowser = async () => {
    setCreated(false);
    if (system) return setBrowser(false);
    const next = permission === 'default' ? await requestPermission() : permission;
    setBrowser(next === 'granted');
  };

  const create = () => {
    if (!ready) return;
    addAutomation({ trigger, scope, action: { inApp: true, system } });
    setCreated(true);
    setEntity(null);
  };

  const sentence = describeAutomation({ trigger, scope });
  const status = created
    ? 'Alert created. You’ll find it under Your alerts.'
    : duplicate
      ? 'You already have this alert.'
      : needsEntity && !entity
        ? `Pick ${kind === 'PLAYER' ? 'a player' : kind === 'TEAM' ? 'a team' : 'a series'} to finish this alert.`
        : `You’ll get an alert ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}.`;

  return (
    <section id={NEW_ALERT_ID} className={styles.creator} aria-labelledby="new-alert-title">
      <h2 id="new-alert-title" className={styles.title}>
        New alert
      </h2>

      <div className={styles.step}>
        <h3 id="alert-what" className={styles.question}>
          What do you want to know?
        </h3>
        <div className={styles.presets} role="radiogroup" aria-labelledby="alert-what">
          {PRESETS.map((p) => (
            <button
              key={p.trigger}
              type="button"
              role="radio"
              aria-checked={trigger === p.trigger}
              className={`${styles.choice} ${trigger === p.trigger ? styles.on : ''}`}
              onClick={() => pickTrigger(p.trigger)}
            >
              <Icon name={TRIGGER_ICON[p.trigger]} size={17} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.step}>
        <h3 id="alert-who" className={styles.question}>
          Who?
        </h3>
        <div className={styles.scopes} role="radiogroup" aria-labelledby="alert-who">
          {scopes.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={kind === s}
              className={`${styles.choice} ${styles.scope} ${kind === s ? styles.on : ''}`}
              onClick={() => pickScope(s)}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        {needsEntity && (
          <EntityPicker kind={kind as 'TEAM' | 'SERIES' | 'PLAYER'} value={entity} onChange={pickEntity} />
        )}
      </div>

      <div className={styles.step}>
        <h3 className={styles.question}>Notify me</h3>
        <div className={styles.delivery}>
          <div className={`${styles.choice} ${styles.on} ${styles.fixed}`}>
            <Icon name="bell" size={17} />
            <span className={styles.deliveryText}>
              <span>In the app</span>
              <span className={styles.note}>Always on</span>
            </span>
            <Icon name="check" size={15} className={styles.tick} />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={system}
            className={`${styles.choice} ${system ? styles.on : ''}`}
            onClick={toggleBrowser}
            disabled={!permission || permission === 'denied' || permission === 'unsupported'}
          >
            <Icon name="signal" size={17} />
            <span className={styles.deliveryText}>
              <span>Browser notification</span>
              {permission && BROWSER_NOTE[permission] && <span className={styles.note}>{BROWSER_NOTE[permission]}</span>}
            </span>
            <span className={styles.switch} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.footer}>
        <p className={styles.status} aria-live="polite">
          {status}
        </p>
        <button type="button" className={styles.create} onClick={create} disabled={!ready}>
          <Icon name={created ? 'check' : 'plus'} size={17} />
          {created ? 'Alert created' : 'Create alert'}
        </button>
      </div>
    </section>
  );
}
