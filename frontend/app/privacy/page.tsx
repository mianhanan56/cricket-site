import { pageMeta } from '@/lib/seo';
import { CONTACT_EMAIL } from '@/lib/site';
import { InfoPage, InfoSection } from '@/components/info/InfoPage';
import styles from './privacy.module.scss';

export const metadata = pageMeta({
  title: 'Privacy Policy',
  description:
    'What PulseCrease stores and why: no accounts, no cookies, anonymous page counts, and your follows and alerts kept in your own browser.',
  path: '/privacy',
});

const UPDATED = '10 November 2026';

const GLANCE: Array<[string, string]> = [
  ['Account', 'None — there is nothing to sign up for'],
  ['Cookies', 'None set by PulseCrease'],
  ['On your device', 'Follows, alert rules, notifications, recent searches, quiz answers, theme'],
  ['Analytics', 'Anonymous page counts, no cookies, no cross-site tracking'],
];

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Privacy"
      title="Privacy policy"
      lead={`PulseCrease has no accounts and keeps your preferences in your own browser. Last updated ${UPDATED}.`}
    >
      <dl className={styles.glance}>
        {GLANCE.map(([term, value]) => (
          <div key={term} className={styles.row}>
            <dt className={styles.term}>{term}</dt>
            <dd className={styles.value}>{value}</dd>
          </div>
        ))}
      </dl>

      <InfoSection id="device" title="What stays on your device">
        <p>
          The teams, players and series you follow, your alert rules, the notifications they raise, recent
          searches, quiz answers and your light or dark theme are saved in your browser’s local storage. They
          are never sent to us, and they don’t follow you to another browser or device.
        </p>
        <p>
          To read pages faster and offline, the site also keeps a copy of recently viewed pages and match data
          in your browser’s cache. Clearing this site’s data in your browser settings removes all of it.
        </p>
      </InfoSection>

      <InfoSection id="notifications" title="Notifications">
        <p>
          Alerts are worked out in your browser while PulseCrease is open. If you allow notifications, your
          browser shows them; there is no push server and no notification address is collected. You can
          withdraw the permission at any time in your browser’s site settings.
        </p>
      </InfoSection>

      <InfoSection id="analytics" title="Analytics and hosting">
        <ul>
          <li>
            <strong>Vercel Web Analytics</strong> counts page views and visits in aggregate. It sets no cookies
            and does not identify you or track you across other sites.
          </li>
          <li>
            <strong>Hosting.</strong> The site is served by Vercel and Cloudflare, which keep standard request
            logs (such as IP address, browser and the page requested) to run and secure the service.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="quiz" title="Match quiz">
        <p>
          Quiz questions are written by Google’s Gemini model from a finished match’s scorecard. Only match
          data is sent to make them — nothing about you. Your answers stay on your device.
        </p>
      </InfoSection>

      <InfoSection id="changes" title="Changes">
        <p>
          If what the site stores changes, this page changes with it and the date above moves.
          {CONTACT_EMAIL && (
            <>
              {' '}
              Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </>
          )}
        </p>
      </InfoSection>
    </InfoPage>
  );
}
