'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import styles from './FilterSheet.module.scss';

export interface FilterGroup {
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string; count?: number }>;
}

type Values = Record<string, string>;

/**
 * The phone version of a page's filters: a "Filters" button with the active
 * ones as removable chips, and a bottom sheet holding every group. The page
 * keeps its own inline filters for tablet and up; this renders nothing there.
 */
export default function FilterSheet<V extends Values>({
  groups,
  value,
  defaults,
  onApply,
  normalize = (v) => v,
  chips = true,
  className,
}: {
  /** Built from the sheet's draft, so a group can depend on another's pick. */
  groups: (draft: V) => FilterGroup[];
  value: V;
  defaults: NoInfer<V>;
  onApply: (next: V) => void;
  /** Repairs combinations that can't exist, e.g. women's Test rankings. */
  normalize?: (draft: V) => NoInfer<V>;
  /** Off where the page title already spells out the selection. */
  chips?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<V>(value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const shown = groups(value);
  const active = shown.filter((g) => value[g.key] !== defaults[g.key]);
  const draftGroups = groups(draft);
  const pristine = draftGroups.every((g) => draft[g.key] === defaults[g.key]);

  const show = () => {
    setDraft(value);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const apply = () => {
    onApply(normalize(draft));
    close();
  };
  const pick = (key: string, next: string) => setDraft((d) => normalize({ ...d, [key]: next } as V));

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab' || !sheet) return;
      const focusable = [...sheet.querySelectorAll<HTMLElement>('button:not(:disabled)')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={`${styles.bar} ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${active.length ? styles.triggerOn : ''}`}
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active.length ? `Filters, ${active.length} active` : 'Filters'}
      >
        <Icon name="filter" size={17} />
        Filters
        {active.length > 0 && <span className={styles.count}>{active.length}</span>}
      </button>

      {chips &&
        active.map((g) => {
          const label = g.options.find((o) => o.value === value[g.key])?.label ?? value[g.key];
          return (
            <button
              key={g.key}
              type="button"
              className={styles.chip}
              onClick={() => onApply(normalize({ ...value, [g.key]: defaults[g.key] } as V))}
              aria-label={`Remove ${g.label.toLowerCase()} filter: ${label}`}
            >
              {label}
              <Icon name="close" size={14} />
            </button>
          );
        })}

      {open &&
        createPortal(
          <div className={styles.layer}>
            <button type="button" className={styles.scrim} aria-label="Close filters" tabIndex={-1} onClick={close} />
            <div ref={sheetRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <div className={styles.head}>
                <h2 id={titleId} className={styles.title}>
                  Filters
                </h2>
                <button type="button" className={styles.close} onClick={close} aria-label="Close filters">
                  <Icon name="close" size={20} />
                </button>
              </div>

              <div className={styles.body}>
                {draftGroups.map((g) => (
                  <section key={g.key} className={styles.group}>
                    <h3 id={`${titleId}-${g.key}`} className={styles.groupLabel}>
                      {g.label}
                    </h3>
                    <div className={styles.options} role="radiogroup" aria-labelledby={`${titleId}-${g.key}`}>
                      {g.options.map((o) => {
                        const on = draft[g.key] === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            className={`${styles.option} ${on ? styles.on : ''}`}
                            onClick={() => pick(g.key, o.value)}
                          >
                            {o.label}
                            {o.count !== undefined && <span className={styles.optionCount}>{o.count}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <div className={styles.foot}>
                <button
                  type="button"
                  className={styles.reset}
                  onClick={() => setDraft(normalize(defaults))}
                  disabled={pristine}
                >
                  Reset
                </button>
                <button type="button" className={styles.apply} onClick={apply}>
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
