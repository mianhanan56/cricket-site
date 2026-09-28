'use client';

import { useState } from 'react';
import {
  addAutomation,
  describeAutomation,
  scopePhrase,
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

const SCOPE_ORDER = Object.keys(SCOPE_LABEL) as ScopeKind[];

/** "a wicket falls, a six is hit or a match finishes" */
function joinPhrases(parts: string[]): string {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

export default function AlertCreator() {
  const automations = useAutomations();
  const follows = useFollows();
  const [permission, requestPermission] = useNotificationPermission();
  const [triggers, setTriggers] = useState<TriggerKind[]>(['WICKET']);
  const [scopeKind, setScopeKind] = useState<ScopeKind | null>(null);
  const [entity, setEntity] = useState<PickedEntity | null>(null);
  const [browser, setBrowser] = useState(false);
  const [created, setCreated] = useState(0);

  // Several moments make one alert each; "Who?" offers only what every chosen moment supports.
  const scopes = triggers.length
    ? SCOPE_ORDER.filter((sc) => triggers.every((t) => triggerSpec(t).scopes.includes(sc)))
    : triggerSpec(PRESETS[0].trigger).scopes;
  const preferred = scopeKind ?? (follows.teams.length || follows.series.length ? 'FOLLOWED' : 'ANY');
  const kind = scopes.includes(preferred) ? preferred : scopes[0];
  const needsEntity = kind === 'TEAM' || kind === 'SERIES' || kind === 'PLAYER';
  const scope: AutomationScope = needsEntity ? { kind, id: entity?.id, name: entity?.name } : { kind };
  const system = browser && permission === 'granted';
  const exists = (t: TriggerKind) =>
    automations.some((a) => a.trigger === t && a.scope.kind === kind && a.scope.id === scope.id);
  const fresh = triggers.filter((t) => !exists(t));
  const ready = triggers.length > 0 && (!needsEntity || Boolean(entity)) && fresh.length > 0;

  const toggleTrigger = (t: TriggerKind) => {
    const next = triggers.includes(t) ? triggers.filter((x) => x !== t) : [...triggers, t];
    setTriggers(next);
    setCreated(0);
    if (next.some((x) => !triggerSpec(x).scopes.includes(kind))) {
      setScopeKind(null);
      setEntity(null);
    }
  };

  const pickScope = (next: ScopeKind) => {
    setScopeKind(next);
    setEntity(null);
    setCreated(0);
  };

  const pickEntity = (next: PickedEntity | null) => {
    setEntity(next);
    setCreated(0);
  };

  const toggleBrowser = async () => {
    setCreated(0);
    if (system) return setBrowser(false);
    const next = permission === 'default' ? await requestPermission() : permission;
    setBrowser(next === 'granted');
  };

  const create = () => {
    if (!ready) return;
    // Added in reverse: the list shows newest first, so this keeps the order they were picked.
    for (const t of [...fresh].reverse()) addAutomation({ trigger: t, scope, action: { inApp: true, system } });
    setCreated(fresh.length);
    setEntity(null);
  };

  const sentence =
    triggers.length === 1
      ? describeAutomation({ trigger: triggers[0], scope })
      : kind === 'PLAYER'
        ? `When ${scope.name ?? 'this player'} reaches ${joinPhrases(triggers.map((t) => (t === 'FIFTY' ? '50' : '100')))}`
        : `When ${joinPhrases(triggers.map((t) => triggerSpec(t).phrase))} ${scopePhrase(scope)}`;
  const skipped = triggers.length - fresh.length;
  const status = created
    ? `${created === 1 ? 'Alert' : `${created} alerts`} created. You’ll find ${created === 1 ? 'it' : 'them'} under Your alerts.`
    : !triggers.length
      ? 'Pick at least one moment.'
      : !fresh.length
        ? `You already have ${triggers.length === 1 ? 'this alert' : 'these alerts'}.`
        : needsEntity && !entity
          ? `Pick ${kind === 'PLAYER' ? 'a player' : kind === 'TEAM' ? 'a team' : 'a series'} to finish ${fresh.length === 1 ? 'this alert' : 'these alerts'}.`
          : `You’ll get an alert ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}.${
              skipped ? ` ${skipped} you already have ${skipped === 1 ? 'is' : 'are'} skipped.` : ''
            }`;

  return (
    <section id={NEW_ALERT_ID} className={styles.creator} aria-labelledby="new-alert-title">
      <h2 id="new-alert-title" className={styles.title}>
        New alert
      </h2>

      <div className={styles.step}>
        <h3 id="alert-what" className={styles.question}>
          What do you want to know?
          <span className={styles.hint}>Pick one or more</span>
        </h3>
        <div className={styles.presets} role="group" aria-labelledby="alert-what">
          {PRESETS.map((p) => {
            const on = triggers.includes(p.trigger);
            return (
              <button
                key={p.trigger}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`${styles.choice} ${on ? styles.on : ''}`}
                onClick={() => toggleTrigger(p.trigger)}
              >
                <Icon name={TRIGGER_ICON[p.trigger]} size={17} />
                <span>{p.label}</span>
                {on && <Icon name="check" size={15} className={styles.tick} />}
              </button>
            );
          })}
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
          {created ? (created === 1 ? 'Alert created' : `${created} alerts created`) : fresh.length > 1 ? `Create ${fresh.length} alerts` : 'Create alert'}
        </button>
      </div>
    </section>
  );
}
