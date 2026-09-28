'use client';

import {
  isFollowing,
  toggleFollow,
  useFollows,
  type FollowedEntity,
  type FollowedTeam,
} from '@/lib/follows';
import Icon from '../ui/Icon';
import styles from './FollowButton.module.scss';

type Common = { compact?: boolean; className?: string; label?: string };
type Props =
  | ({ kind: 'teams'; entity: FollowedTeam } & Common)
  | ({ kind: 'players' | 'series'; entity: FollowedEntity } & Common);

export default function FollowButton(props: Props) {
  const follows = useFollows();
  const on = isFollowing(follows, props.kind, props.entity.id);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.kind === 'teams') toggleFollow('teams', props.entity);
    else toggleFollow(props.kind, props.entity);
  };

  return (
    <button
      type="button"
      className={`${props.label ? styles.labelled : props.compact ? styles.compact : styles.button} ${on ? styles.on : ''} ${props.className ?? ''}`}
      aria-pressed={on}
      aria-label={`${on ? 'Unfollow' : 'Follow'} ${props.entity.name}`}
      onClick={toggle}
    >
      <Icon name="star" size={props.compact ? 16 : 17} filled={on} />
      {props.label ? <span>{props.label}</span> : !props.compact && <span>{on ? 'Following' : 'Follow'}</span>}
    </button>
  );
}
