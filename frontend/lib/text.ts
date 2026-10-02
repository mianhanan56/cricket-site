/** 1st, 2nd, 3rd, 11th, 22nd. */
export function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** "1 run", "4 runs". */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
