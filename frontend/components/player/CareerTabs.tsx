'use client';

import { useState, type ReactNode } from 'react';
import Segmented from '../ui/Segmented';
import { SectionHead } from '../ui/Section';

export type CareerLevel = 'international' | 'domestic';

/** The career tables, one level at a time; the tables are rendered on the server and only swapped here. */
export default function CareerTabs({
  levels,
  className,
}: {
  levels: Array<{ value: CareerLevel; label: string; content: ReactNode }>;
  className?: string;
}) {
  const [picked, setPicked] = useState<CareerLevel>(levels[0]?.value ?? 'international');
  const shown = levels.find((l) => l.value === picked) ?? levels[0];
  if (!shown) return null;

  return (
    <section className={className} aria-labelledby="career">
      <SectionHead title="Career" id="career" end>
        {levels.length > 1 && (
          <Segmented
            label="Competition level"
            value={shown.value}
            options={levels.map((l) => ({ value: l.value, label: l.label }))}
            onChange={setPicked}
          />
        )}
      </SectionHead>
      {shown.content}
    </section>
  );
}
