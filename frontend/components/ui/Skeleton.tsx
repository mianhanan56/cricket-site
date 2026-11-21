import styles from './Skeleton.module.scss';

export type SkeletonVariant =
  | 'text'
  | 'body'
  | 'title'
  | 'display'
  | 'chip'
  | 'circle'
  | 'square'
  | 'block';

export type SkeletonWidth =
  | '10'
  | '15'
  | '20'
  | '25'
  | '30'
  | '40'
  | '50'
  | '60'
  | '70'
  | '80'
  | '90'
  | '100';

export type SkeletonSize = '20' | '26' | '40' | '44' | '56' | '68' | '96';

export interface SkeletonProps {
  /**
   * Height + radius preset. Omit it when `className` carries its own height —
   * a variant and a class both setting `height` would resolve by stylesheet
   * order across module boundaries, which is not something to leave to chance.
   */
  variant?: SkeletonVariant;
  /** Width as a percentage of the container. */
  width?: SkeletonWidth;
  /** Fixed pixel size — for `circle` and `square`. */
  size?: SkeletonSize;
  /** Borrow geometry from another module's class. */
  className?: string;
}

// Page skeletons pass the real component's className so the placeholder fills the same box.
export default function Skeleton({ variant, width, size, className }: SkeletonProps) {
  const classes = [styles.sk];
  if (variant) classes.push(styles[variant] ?? '');
  if (width) classes.push(styles[`w${width}`]);
  if (size) classes.push(styles[`s${size}`]);
  if (className) classes.push(className);

  // Decorative: the surrounding region carries the role="status" announcement.
  return <span aria-hidden="true" className={classes.join(' ')} />;
}

/** Container classes that phase child placeholders into one travelling wave. */
export const stagger = styles.stagger;
export const staggerRows = styles.staggerRows;
