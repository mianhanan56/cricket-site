import { shareImage } from '@/lib/brandImage';

export const alt = 'PulseCrease — Live Cricket Intelligence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return shareImage();
}
