import { notFound } from 'next/navigation';
import { markImage } from '@/lib/brandImage';

// The manifest's PNG icons; SVG icons are not accepted for install on every platform.
const SIZES = ['192', '512'] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export function GET(_req: Request, { params }: { params: { size: string } }) {
  if (!(SIZES as readonly string[]).includes(params.size)) notFound();
  return markImage(Number(params.size));
}
