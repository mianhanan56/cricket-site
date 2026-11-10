import type { ITeam, Match, NewsArticle, PlayerProfile } from '@/types';
import { SITE_URL } from './site';
import { HOME_DESCRIPTION, SITE_NAME } from './seo';
import { VENUE_TBD } from './venue';
import { matchOrdinal } from './seriesFormat';

type Thing = Record<string, unknown>;

const abs = (path: string) => `${SITE_URL}${path}`;
const ORG_ID = abs('/#organization');

export function siteGraph(): Thing {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORG_ID,
        name: SITE_NAME,
        url: abs('/'),
        logo: abs('/icons/512'),
      },
      {
        '@type': 'WebSite',
        '@id': abs('/#website'),
        name: SITE_NAME,
        url: abs('/'),
        description: HOME_DESCRIPTION,
        publisher: { '@id': ORG_ID },
        inLanguage: 'en',
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: abs('/search?q={search_term_string}') },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}

export function breadcrumbs(items: Array<{ name: string; path: string }>): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', path: '/' }, ...items].map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: abs(item.path),
    })),
  };
}

const teamRef = (team: ITeam): Thing => ({
  '@type': 'SportsTeam',
  name: team.name,
  sport: 'Cricket',
  url: abs(`/teams/${team.id}`),
  ...(team.logo ? { logo: team.logo } : {}),
});

export function sportsEvent(match: Match): Thing {
  const name = `${match.homeTeam.name} vs ${match.awayTeam.name}, ${match.stage ?? matchOrdinal(match)}`;
  const venueKnown = match.venue && match.venue !== VENUE_TBD;
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name,
    description: `${name} — ${match.series.name}.${match.result ? ` ${match.result}.` : ''}`,
    url: abs(`/matches/${match.id}`),
    sport: 'Cricket',
    startDate: match.startTime,
    // schema.org has no "finished" status; a played match is still the scheduled event.
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    homeTeam: teamRef(match.homeTeam),
    awayTeam: teamRef(match.awayTeam),
    competitor: [teamRef(match.homeTeam), teamRef(match.awayTeam)],
    ...(venueKnown
      ? {
          location: {
            '@type': 'Place',
            name: match.venue,
            ...(match.venueId ? { url: abs(`/venues/${match.venueId}`) } : {}),
          },
        }
      : {}),
    ...(match.series.id
      ? { superEvent: { '@type': 'SportsEvent', name: match.series.name, url: abs(`/series/${match.series.id}`) } }
      : {}),
    organizer: { '@type': 'Organization', name: match.series.name },
  };
}

export function person(player: PlayerProfile): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: player.name,
    url: abs(`/players/${player.id}`),
    jobTitle: `Cricketer (${player.role})`,
    ...(player.image ? { image: player.image } : {}),
    ...(player.dateOfBirth ? { birthDate: player.dateOfBirth.slice(0, 10) } : {}),
    ...(player.birthPlace ? { birthPlace: { '@type': 'Place', name: player.birthPlace } } : {}),
    ...(player.nationality ? { nationality: { '@type': 'Country', name: player.nationality } } : {}),
    ...(player.height ? { height: player.height } : {}),
    gender: player.gender,
    ...(player.countryKey && player.countryShortName
      ? { memberOf: { '@type': 'SportsTeam', name: player.countryShortName, url: abs(`/teams/${player.countryKey}`) } }
      : {}),
    sameAs: [
      player.instagram && `https://instagram.com/${player.instagram}`,
      player.twitter && `https://x.com/${player.twitter}`,
    ].filter(Boolean),
  };
}

export function sportsTeam(team: ITeam): Thing {
  return { '@context': 'https://schema.org', ...teamRef(team) };
}

export function place(id: string, name: string): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'StadiumOrArena',
    name,
    url: abs(`/venues/${id}`),
  };
}

export function newsArticle(article: NewsArticle): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    url: abs(`/news/${article.slug}`),
    datePublished: article.publishedAt,
    ...(article.excerpt ? { description: article.excerpt } : {}),
    ...(article.image ? { image: [article.image] } : {}),
    ...(article.author ? { author: { '@type': 'Person', name: article.author } } : {}),
    publisher: { '@id': ORG_ID },
    ...(article.tags.length ? { keywords: article.tags.map((t) => t.name).join(', ') } : {}),
  };
}
