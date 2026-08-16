'use client';

import type { RankingEntry, TeamRankingEntry } from '@/types';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import type {
  RankingsCategory as Category,
  RankingsFormat as Format,
  RankingsGender as Gender,
  RankingsGroup as Group,
} from '@/lib/tabs';
import type { RankingsData, TeamRankingsData } from '@/lib/rankings';
import FilterSelect, { type FilterOption } from '../ui/FilterSelect';
import RankingCrest from './RankingCrest';
import styles from './RankingsView.module.scss';

const GROUPS: readonly FilterOption<Group>[] = [
  { value: 'players', label: 'Players' },
  { value: 'teams', label: 'Teams' },
];

const GENDERS: readonly FilterOption<Gender>[] = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
];

const FORMATS: readonly FilterOption<Format>[] = [
  { value: 'test', label: 'Test' },
  { value: 'odi', label: 'ODI' },
  { value: 't20i', label: 'T20I' },
];

const CATEGORIES: readonly FilterOption<Category>[] = [
  { value: 'batting', label: 'Batting' },
  { value: 'bowling', label: 'Bowling' },
  { value: 'all-rounder', label: 'All-rounder' },
];

/**
 * The one row shape the podium and the table render.
 *
 * Players and teams arrive as different types on purpose (see TeamRankingEntry),
 * but they are the *same list* on the page — same podium, same columns for the
 * three they share. Normalizing once here is what keeps the JSX from branching
 * on `group` in a dozen places, and it is where the per-group differences are
 * stated: a player row carries a country and a movement, a team row carries
 * matches and points.
 */
interface Row {
  id: string;
  position: number;
  title: string;
  /** Country for a player; the match count for a team. */
  subtitle: string;
  rating: number;
  /** Places gained since the last list. Undefined when the source has no `pr`. */
  movement?: number;
  crest?: { logo: string | null; shortName: string };
  matches?: number;
  points?: number;
}

const toPlayerRow = (e: RankingEntry): Row => ({
  id: e.id,
  position: e.position,
  title: e.playerName,
  subtitle: e.country,
  rating: e.rating,
  movement:
    typeof e.previousPosition === 'number' ? e.previousPosition - e.position : undefined,
});

const toTeamRow = (e: TeamRankingEntry): Row => ({
  id: e.id,
  position: e.position,
  title: e.teamName,
  subtitle: `${e.matches} ${e.matches === 1 ? 'match' : 'matches'}`,
  rating: e.rating,
  crest: { logo: e.logo, shortName: e.shortName },
  matches: e.matches,
  points: e.points,
});

/**
 * Places gained or lost, as a chip.
 *
 * Nothing is drawn for a row whose source doesn't publish a previous position —
 * a "—" there would read as "held its place", which is a claim we can't make.
 */
function Movement({ places }: { places: number | undefined }) {
  if (places === undefined) return null;

  if (places === 0) {
    return (
      <span className={`${styles.move} ${styles.moveFlat}`} title="No change">
        <span aria-hidden="true">–</span>
        <span className={styles.srOnly}>No change</span>
      </span>
    );
  }

  const up = places > 0;
  const n = Math.abs(places);

  return (
    <span className={`${styles.move} ${up ? styles.moveUp : styles.moveDown}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {n}
      <span className={styles.srOnly}>{` place${n === 1 ? '' : 's'} ${up ? 'up' : 'down'}`}</span>
    </span>
  );
}

export interface RankingsViewProps {
  data: RankingsData;
  teams: TeamRankingsData;
  /**
   * ICC publication date per gender. Folded into the caption rather than given
   * its own element — a date is a qualifier on "official", not a fact of its
   * own, and the numbers can lag by weeks so leaving it implicit is dishonest.
   */
  asOf?: Partial<Record<Gender, string>>;
  /** Active controls, read off the URL by the page. */
  initial: { group: Group; format: Format; gender: Gender; category: Category };
}

/** How many rows sit in the podium above the table. */
const PODIUM = 3;

export default function RankingsView({ data, teams, asOf, initial }: RankingsViewProps) {
  // Every control lives in the URL, so a specific list is linkable:
  // /rankings?group=teams&format=test&gender=women.
  const [{ group, format, gender, category }, setQuery] = useQueryTabs(initial, {
    group: 'players',
    format: 'odi',
    gender: 'men',
    category: 'batting',
  });

  // The ICC publishes no Women's Test rankings — drop that option for women.
  const formats = gender === 'women' ? FORMATS.filter((f) => f.value !== 'test') : FORMATS;

  // Switching to women while on Test would land on an empty list, so the
  // format moves with the gender in the same URL update.
  const changeGender = (g: Gender) =>
    setQuery(g === 'women' && format === 'test' ? { gender: g, format: 'odi' } : { gender: g });

  const isTeams = group === 'teams';
  const rows: Row[] = isTeams
    ? (teams[format]?.[gender] ?? []).map(toTeamRow)
    : (data[format]?.[gender]?.[category] ?? []).map(toPlayerRow);

  const formatLabel = FORMATS.find((f) => f.value === format)?.label ?? '';
  const podium = rows.slice(0, PODIUM);
  const rest = rows.slice(PODIUM);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.heading}>ICC Rankings</h1>
        <p className={styles.caption}>
          Official {formatLabel} {isTeams ? 'team' : 'player'} rankings
          {asOf?.[gender] ? ` · as of ${asOf[gender]}` : ''}
        </p>
      </header>

      {/*
        One rail of dropdowns rather than three rows of tabs. Nine tabs across
        three rows spent most of the page's vertical budget restating options
        that are two clicks away either way — and the rail scales, which the tab
        rows had already stopped doing at four axes.
      */}
      <div className={styles.rail}>
        <FilterSelect
          label="Ranking"
          value={group}
          options={GROUPS}
          align="left"
          onChange={(g) => setQuery({ group: g })}
        />
        <FilterSelect
          label="Gender"
          value={gender}
          options={GENDERS}
          align="left"
          onChange={changeGender}
        />
        <FilterSelect
          label="Format"
          value={format}
          options={formats}
          align="left"
          onChange={(f) => setQuery({ format: f })}
        />
        {/* Teams are ranked as sides, so there is no discipline to pick. */}
        {!isTeams && (
          <FilterSelect
            label="Discipline"
            value={category}
            options={CATEGORIES}
            align="left"
            onChange={(c) => setQuery({ category: c })}
          />
        )}
      </div>

      {rows.length ? (
        <>
          {/*
            Signature element — the podium. The old page spotlighted #1 alone,
            which is the one rank a reader can already name; the interesting
            information in a ranking is the top three and the gaps between them,
            so all three get a card and #1 keeps the aurora wash.
          */}
          <ol className={styles.podium}>
            {podium.map((row, i) => (
              <li
                key={row.id}
                // Below 576px the runners-up collapse to a single row each —
                // three full-height cards there pushed the table off the fold
                // for the sake of two names.
                className={`${styles.step} ${i === 0 ? styles.stepLead : styles.stepCompact}`}
              >
                <div className={styles.stepTop}>
                  <span className={styles.stepRank} aria-hidden="true">
                    {row.position}
                  </span>
                  {row.crest && (
                    <RankingCrest
                      name={row.title}
                      shortName={row.crest.shortName}
                      logo={row.crest.logo}
                      size={i === 0 ? 'lg' : 'sm'}
                    />
                  )}
                  <Movement places={row.movement} />
                </div>

                <div className={styles.stepBody}>
                  <span className={styles.stepEyebrow}>Rank {row.position}</span>
                  <span className={styles.stepName}>{row.title}</span>
                  <span className={styles.stepSub}>{row.subtitle}</span>
                </div>

                <div className={styles.stepScore}>
                  <span className={styles.stepRating}>{row.rating}</span>
                  <span className={styles.stepRatingLabel}>Rating</span>
                </div>
              </li>
            ))}
          </ol>

          {rest.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  {isTeams ? 'Team' : 'Player'} rankings, {formatLabel}, positions{' '}
                  {rest[0].position} to {rest[rest.length - 1].position}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col" className={styles.left}>
                      {isTeams ? 'Team' : 'Player'}
                    </th>
                    {isTeams ? (
                      <>
                        <th scope="col" className={styles.hideSm}>
                          Matches
                        </th>
                        <th scope="col" className={styles.hideSm}>
                          Points
                        </th>
                      </>
                    ) : (
                      <>
                        <th scope="col" className={`${styles.left} ${styles.hideSm}`}>
                          Country
                        </th>
                        <th scope="col" className={styles.hideSm}>
                          Move
                        </th>
                      </>
                    )}
                    <th scope="col">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.pos}>{row.position}</td>
                      <td className={styles.left}>
                        <span className={styles.nameCell}>
                          {row.crest && (
                            <RankingCrest
                              name={row.title}
                              shortName={row.crest.shortName}
                              logo={row.crest.logo}
                            />
                          )}
                          <span className={styles.nameStack}>
                            <span className={styles.name}>{row.title}</span>
                            {/* The columns the table drops on a phone reappear
                                here, so nothing is lost to the narrow band. */}
                            <span className={styles.nameMeta}>{row.subtitle}</span>
                          </span>
                        </span>
                      </td>
                      {isTeams ? (
                        <>
                          <td className={`${styles.stat} ${styles.hideSm}`}>{row.matches}</td>
                          <td className={`${styles.stat} ${styles.hideSm}`}>{row.points}</td>
                        </>
                      ) : (
                        <>
                          <td className={`${styles.left} ${styles.muted} ${styles.hideSm}`}>
                            {row.subtitle}
                          </td>
                          <td className={styles.hideSm}>
                            <Movement places={row.movement} />
                          </td>
                        </>
                      )}
                      <td className={styles.num}>{row.rating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className={styles.empty}>
          No {isTeams ? 'team' : 'player'} rankings published for this combination yet.
        </p>
      )}
    </div>
  );
}
