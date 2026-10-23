'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import Segmented from '../ui/Segmented';
import { SectionHead } from '../ui/Section';
import type { Discipline } from './FormCard';

export type FormView = 'recent' | 'series';

const DisciplineContext = createContext<{ picked: Discipline | null; pick: (d: Discipline) => void } | null>(null);

/** Batting or bowling: one pick for both views inside the Form section, the view's own outside it. */
export function useFormDiscipline(fallback: Discipline): [Discipline, (d: Discipline) => void] {
  const shared = useContext(DisciplineContext);
  const [own, setOwn] = useState(fallback);
  return shared ? [shared.picked ?? fallback, shared.pick] : [own, setOwn];
}

/**
 * Recent form and series performance as two views of one section. Both stay mounted, so a
 * series picked in one visit to the tab is still there on the next.
 */
export default function FormTabs({
  recent,
  series,
  initial,
  className,
}: {
  recent: ReactNode | null;
  series: ReactNode;
  initial: FormView;
  className?: string;
}) {
  const [view, setView] = useState<FormView>(recent ? initial : 'series');
  const [picked, pick] = useState<Discipline | null>(null);
  const shared = useMemo(() => ({ picked, pick }), [picked]);

  return (
    <DisciplineContext.Provider value={shared}>
      <section className={className} aria-labelledby="form">
        <SectionHead title={recent ? 'Form' : 'Series performance'} id="form" end>
          {recent && (
            <Segmented
              label="Form view"
              value={view}
              options={[
                { value: 'recent', label: 'Recent' },
                { value: 'series', label: 'By series' },
              ]}
              onChange={setView}
            />
          )}
        </SectionHead>
        {recent && <div hidden={view !== 'recent'}>{recent}</div>}
        <div hidden={view !== 'series'}>{series}</div>
      </section>
    </DisciplineContext.Provider>
  );
}
