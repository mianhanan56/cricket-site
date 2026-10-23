import { Fragment } from 'react';
import type { FeedNote, RichParagraph, Team } from '@/types';
import { playerImageUrl } from '@/lib/crex';
import PlayerPortrait from '../player/PlayerPortrait';
import PlayerLink from './PlayerLink';
import styles from './FeedNotes.module.scss';

export interface NoteContext {
  /** Player names by key, for the cards crex sends with keys only. */
  names: Map<string, string>;
  team: (id: string | null) => Team | null;
  /** "ODI", "T20", "Test". */
  format: string;
  /** Whether a decided review kept its side's review, where the count before it is held. */
  retained: Map<string, boolean>;
}

const fixed = (n: number | null, digits = 2) => (n === null ? '—' : n.toFixed(digits));

function Rich({ paragraphs }: { paragraphs: RichParagraph[] }) {
  return (
    <>
      {paragraphs.map((lines, i) => (
        <p key={i} className={styles.para}>
          {lines.map((runs, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {runs.map((r, k) =>
                r.title ? (
                  <strong key={k} className={styles.title}>
                    {r.text}
                  </strong>
                ) : r.strong ? (
                  <strong key={k}>{r.text}</strong>
                ) : (
                  <Fragment key={k}>{r.text}</Fragment>
                )
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

function Figures({ items }: { items: Array<[string, string | number]> }) {
  return (
    <dl className={styles.figs}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewsLeft({ left, ctx }: { left: Record<string, number>; ctx: NoteContext }) {
  const sides = Object.entries(left)
    .map(([id, n]) => [ctx.team(id)?.shortName ?? id, n] as const)
    .filter(([name]) => name);
  if (!sides.length) return null;
  return (
    <p className={styles.reviewsLeft}>
      Reviews left
      {sides.map(([name, n]) => (
        <span key={name}>
          {name} <strong>{n}</strong>
        </span>
      ))}
    </p>
  );
}

function batterContext(position: number | null): string {
  if (position === 1) return "Opening at the striker's end";
  if (position === 2) return "Opening at the non-striker's end";
  return 'New batter';
}

const MILESTONE_WORD: Record<number, string> = { 50: 'Fifty', 100: 'Hundred', 150: '150', 200: 'Double hundred', 300: 'Triple hundred' };

/** One of crex's interleaved items, as a row of the commentary list. */
export default function FeedNoteRow({ note, ctx }: { note: FeedNote; ctx: NoteContext }) {
  switch (note.kind) {
    case 'text':
      return (
        <li className={`${styles.note} ${note.featured ? styles.record : styles.text}`}>
          <Rich paragraphs={note.paragraphs} />
        </li>
      );

    case 'player': {
      const batter = note.role === 'batter';
      const { career } = note;
      const sub = [note.rank && `Rank #${note.rank}`, note.age && `${note.age} yrs`].filter(Boolean).join(' · ');
      return (
        <li className={`${styles.note} ${styles.card}`}>
          <div className={styles.cardHead}>
            <span>{batter ? batterContext(note.position) : 'New bowling spell'}</span>
            <span>{ctx.format} career</span>
          </div>
          <div className={styles.player}>
            <PlayerPortrait name={note.name} src={playerImageUrl(note.playerId)} size="sm" />
            <div className={styles.who}>
              <PlayerLink id={note.playerId} name={note.name} className={styles.name} />
              {sub && <span className={styles.sub}>{sub}</span>}
            </div>
            <Figures
              items={
                batter
                  ? [
                      ['Inns', career.innings],
                      ['Runs', career.total],
                      ['Avg', fixed(career.average)],
                      ['SR', fixed(career.rate, 1)],
                    ]
                  : [
                      ['Inns', career.innings],
                      ['Wkts', career.total],
                      ['Econ', fixed(career.rate)],
                      ['Avg', fixed(career.average)],
                    ]
              }
            />
          </div>
        </li>
      );
    }

    case 'battle': {
      const batter = ctx.names.get(note.batterId);
      const bowler = ctx.names.get(note.bowlerId);
      if (!batter || !bowler) return null;
      return (
        <li className={`${styles.note} ${styles.card}`}>
          <div className={styles.cardHead}>
            <span>Batter v bowler</span>
            <span>{[note.format, note.since && `since ${note.since}`].filter(Boolean).join(' · ')}</span>
          </div>
          <p className={styles.pair}>
            <PlayerLink id={note.batterId} name={batter} className={styles.name} />
            <span className={styles.v}>v</span>
            <PlayerLink id={note.bowlerId} name={bowler} className={styles.name} />
          </p>
          <Figures
            items={[
              ['Inns', note.innings],
              ['Runs', note.runs],
              ['Balls', note.balls],
              ['Outs', note.outs],
              ['SR', fixed(note.strikeRate, 1)],
            ]}
          />
        </li>
      );
    }

    case 'versus': {
      const player = ctx.names.get(note.playerId);
      const opponent = ctx.team(note.opponentId);
      if (!player || !opponent) return null;
      return (
        <li className={`${styles.note} ${styles.card}`}>
          <div className={styles.cardHead}>
            <span>Against {opponent.name}</span>
            <span>{note.format ? `${note.format} career` : 'Career'}</span>
          </div>
          <p className={styles.pair}>
            <PlayerLink id={note.playerId} name={player} className={styles.name} />
          </p>
          <Figures
            items={[
              ['Inns', note.innings],
              ['Runs', note.runs],
              ['Avg', fixed(note.average)],
              ['SR', fixed(note.strikeRate, 1)],
            ]}
          />
        </li>
      );
    }

    case 'review':
      return (
        <li className={`${styles.note} ${styles.card} ${styles.review}`}>
          <div className={styles.cardHead}>
            <span>Review</span>
          </div>
          <p className={styles.body}>{note.text}</p>
          <ReviewsLeft left={note.reviewsLeft} ctx={ctx} />
        </li>
      );

    case 'decision': {
      const side = ctx.team(note.by === 'batting' ? note.battingId : note.fieldingId);
      const kept = ctx.retained.get(note.id);
      // A batter reviews an out; the fielding side a not out.
      const onField = note.by === 'batting' ? 'Out' : 'Not out';
      return (
        <li className={`${styles.note} ${styles.card} ${note.out ? styles.out : styles.notOut}`}>
          <div className={styles.verdict}>
            <span className={styles.call}>{note.out ? 'Out' : 'Not out'}</span>
            {kept !== undefined && <span className={styles.kept}>{kept ? 'Review retained' : 'Review lost'}</span>}
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>{note.by === 'batting' ? 'Batting review' : 'Bowling review'}</dt>
              <dd>{side?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>On-field call</dt>
              <dd>{onField}</dd>
            </div>
            {note.ultraEdge !== null && (
              <div>
                <dt>UltraEdge</dt>
                <dd>{note.ultraEdge ? 'Bat involved' : 'No bat involved'}</dd>
              </div>
            )}
          </dl>
          <ReviewsLeft left={note.reviewsLeft} ctx={ctx} />
        </li>
      );
    }

    case 'milestone': {
      const team = !note.playerId;
      const word = team ? `${note.score} up` : (MILESTONE_WORD[note.score] ?? String(note.score));
      const detail = team
        ? (/in ([\d.]+) overs?/i.exec(note.text)?.[0] ?? '')
        : note.balls
          ? `${note.score} off ${note.balls} balls`
          : '';
      return (
        <li className={`${styles.note} ${styles.strip} ${styles.milestone}`}>
          <span className={styles.stripWord}>{word}</span>
          {team ? <span className={styles.name}>{note.name}</span> : <PlayerLink id={note.playerId} name={note.name} className={styles.name} />}
          {detail && <span className={styles.detail}>{detail}</span>}
        </li>
      );
    }

    case 'wicket':
      return (
        <li className={`${styles.note} ${styles.strip} ${styles.wicket}`}>
          <span className={styles.stripWord}>Out</span>
          <PlayerLink id={note.playerId} name={note.name} className={styles.name} />
          {note.how && <span className={styles.how}>{note.how}</span>}
          <span className={styles.detail}>
            {note.runs} ({note.balls}) · 4s {note.fours} · 6s {note.sixes}
            {note.strikeRate ? ` · SR ${note.strikeRate}` : ''}
          </span>
        </li>
      );

    case 'target':
      return (
        <li className={`${styles.note} ${styles.strip} ${styles.target}`}>
          <span className={styles.stripWord}>Chase</span>
          <span className={styles.body}>{note.text}</span>
          {note.rrr && <span className={styles.detail}>Required rate {note.rrr}</span>}
        </li>
      );

    case 'toss':
      return (
        <li className={`${styles.note} ${styles.strip}`}>
          <span className={styles.stripWord}>Toss</span>
          <span className={styles.body}>{note.text}</span>
        </li>
      );

    case 'inningsEnd':
      return (
        <li className={`${styles.note} ${styles.strip} ${styles.inningsEnd}`}>
          <span className={styles.stripWord}>Innings over</span>
          <span className={styles.name}>{note.teamName}</span>
          <span className={styles.detail}>
            {note.score}
            {note.overs ? ` (${note.overs} ov)` : ''}
          </span>
        </li>
      );
  }
}
