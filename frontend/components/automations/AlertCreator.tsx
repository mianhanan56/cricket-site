'use client';

import { useState } from 'react';
import {
  addAutomation,
  describeAutomation,
  sameScope,
  scopePhrase,
  triggerSpec,
  updateAutomation,
  useAutomations,
  type Automation,
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
const PRESET_ORDER = PRESETS.map((p) => p.trigger);
const inOrder = (list: TriggerKind[]) => PRESET_ORDER.filter((t) => list.includes(t));

export default function AlertCreator({
  editing = null,
  notice = null,
  onDone,
}: {
  /** The alert being changed; null for a new one. */
  editing?: Automation | null;
  /** A message carried over from the last save, shown until the form is touched. */
  notice?: string | null;
  onDone?: (message: string | null) => void;
}) {
  const automations = useAutomations();
  const follows = useFollows();
  const [permission, requestPermission] = useNotificationPermission();
  const [triggers, setTriggers] = useState<TriggerKind[]>(editing?.triggers ?? ['WICKET']);
  const [scopeKind, setScopeKind] = useState<ScopeKind | null>(editing?.scope.kind ?? null);
  const [entity, setEntity] = useState<PickedEntity | null>(
    editing?.scope.id ? { id: editing.scope.id, name: editing.scope.name ?? editing.scope.id } : null
  );
  const [browser, setBrowser] = useState(editing?.action.system ?? false);
  const [done, setDone] = useState<string | null>(notice);

  // "Who?" offers only what every chosen moment supports.
  const scopes = triggers.length
    ? SCOPE_ORDER.filter((sc) => triggers.every((t) => triggerSpec(t).scopes.includes(sc)))
    : triggerSpec(PRESETS[0].trigger).scopes;
  const preferred = scopeKind ?? (follows.teams.length || follows.series.length ? 'FOLLOWED' : 'ANY');
  const kind = scopes.includes(preferred) ? preferred : scopes[0];
  const needsEntity = kind === 'TEAM' || kind === 'SERIES' || kind === 'PLAYER';
  const scope: AutomationScope = needsEntity ? { kind, id: entity?.id, name: entity?.name } : { kind };
  const system = browser && permission === 'granted';

  const allOn = PRESET_ORDER.every((t) => triggers.includes(t));
  const covered = automations.some(
    (a) => a.id !== editing?.id && sameScope(a.scope, scope) && triggers.every((t) => a.triggers.includes(t))
  );
  const changed =
    !editing ||
    inOrder(triggers).join() !== inOrder(editing.triggers).join() ||
    !sameScope(editing.scope, scope) ||
    editing.action.system !== system;
  const created = done !== null && done !== notice;
  const ready = triggers.length > 0 && (!needsEntity || Boolean(entity)) && !covered && changed;

  const pickTriggers = (next: TriggerKind[]) => {
    setTriggers(next);
    setDone(null);
    if (next.some((x) => !triggerSpec(x).scopes.includes(kind))) {
      setScopeKind(null);
      setEntity(null);
    }
  };

  const toggleTrigger = (t: TriggerKind) =>
    pickTriggers(triggers.includes(t) ? triggers.filter((x) => x !== t) : [...triggers, t]);

  const pickScope = (next: ScopeKind) => {
    setScopeKind(next);
    setEntity(null);
    setDone(null);
  };

  const pickEntity = (next: PickedEntity | null) => {
    setEntity(next);
    setDone(null);
  };

  const toggleBrowser = async () => {
    setDone(null);
    if (system) return setBrowser(false);
    const next = permission === 'default' ? await requestPermission() : permission;
    setBrowser(next === 'granted');
  };

  const save = () => {
    if (!ready) return;
    const input = { triggers: inOrder(triggers), scope, action: { inApp: true, system } };
    if (editing) {
      updateAutomation(editing.id, input);
      onDone?.('Changes saved.');
      return;
    }
    addAutomation(input);
    setDone('Alert created. You’ll find it under Your alerts.');
    setEntity(null);
  };

  const status = done
    ? done
    : !triggers.length
      ? 'Pick at least one moment.'
      : needsEntity && !entity
        ? `Pick ${kind === 'PLAYER' ? 'a player' : kind === 'TEAM' ? 'a team' : 'a series'} to finish this alert.`
        : covered
          ? 'One of your alerts already covers this.'
          : allOn
            ? `You’ll get an alert for every match event ${scopePhrase(scope)}.`
            : (() => {
                const sentence = describeAutomation({ triggers: inOrder(triggers), scope });
                return `You’ll get an alert ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}.`;
              })();

  return (
    <section id={NEW_ALERT_ID} className={styles.creator} aria-labelledby="new-alert-title">
      <h2 id="new-alert-title" className={styles.title}>
        {editing ? 'Edit alert' : 'New alert'}
      </h2>

      <div className={styles.step}>
        <h3 id="alert-what" className={styles.question}>
          What do you want to know?
          <span className={styles.hint}>Pick one or more</span>
        </h3>
        <button
          type="button"
          role="checkbox"
          aria-checked={allOn ? true : triggers.length ? 'mixed' : false}
          className={`${styles.selectAll} ${triggers.length ? styles.selectAllOn : ''}`}
          onClick={() => pickTriggers(allOn ? [] : PRESET_ORDER)}
        >
          <span className={styles.box} aria-hidden="true">
            {allOn ? <Icon name="check" size={14} strokeWidth={2.4} /> : triggers.length ? <Icon name="minus" size={14} strokeWidth={2.4} /> : null}
          </span>
          Select all
        </button>
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
        <div className={styles.actions}>
          {editing && (
            <button type="button" className={styles.cancel} onClick={() => onDone?.(null)}>
              Cancel
            </button>
          )}
          <button type="button" className={styles.create} onClick={save} disabled={!ready}>
            <Icon name={editing || created ? 'check' : 'plus'} size={17} />
            {editing ? 'Save changes' : created ? 'Alert created' : 'Create alert'}
          </button>
        </div>
      </div>
    </section>
  );
}
