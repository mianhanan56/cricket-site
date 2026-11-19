import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainText, richText } from '../lib/api/feedNotes';
import { istToPakistan, pktToZone } from '../lib/pakistanTime';

describe('IST stamps as Pakistan time', () => {
  it('folds a local time that matches PKT into one stamp', () => {
    assert.equal(
      istToPakistan('<b>2:13 PM IST, 1:43 PM Local Time: Drinks are on the field now.</b>'),
      '<b>1:43 PM PKT & Local Time: Drinks are on the field now.</b>'
    );
  });

  it('keeps an Indian venue’s local time', () => {
    assert.equal(istToPakistan('7:44 PM IST & Local Time: Drinks Break!'), '7:14 PM PKT, 7:44 PM Local Time: Drinks Break!');
  });

  it('keeps a foreign venue’s local time', () => {
    assert.equal(istToPakistan('3:30 PM IST, 11:00 AM Local Time: Lunch'), '3:00 PM PKT, 11:00 AM Local Time: Lunch');
  });

  it('converts a bare IST time mid-sentence and wraps past midnight', () => {
    assert.equal(istToPakistan('Play resumes at 12:15 AM IST tomorrow'), 'Play resumes at 11:45 PM PKT tomorrow');
    assert.equal(istToPakistan('Start at 09:30 IST'), 'Start at 09:00 PKT');
  });

  it('reads a stamp a bold tag splits, and keeps the tag', () => {
    assert.equal(istToPakistan('<b>2:13 PM IST</b> & Local Time: Drinks'), '<b>1:43 PM PKT, 2:13 PM Local Time</b>: Drinks');
  });

  it('reads times without minutes', () => {
    assert.equal(
      istToPakistan('Coverage returns at 9 AM IST, 8:30 AM Local Time, play at 10 AM IST'),
      'Coverage returns at 8:30 AM PKT & Local Time, play at 9:30 AM PKT'
    );
    assert.equal(istToPakistan('Day 4 IST plans'), 'Day 4 IST plans');
  });

  it('leaves text without IST times alone', () => {
    const s = 'ISTANBUL 4:30 PM GMT, 13 IST nonsense';
    assert.equal(istToPakistan(s), s);
  });

  it('applies to the text the feed renders', () => {
    assert.equal(plainText('<b>2:13 PM IST, 1:43 PM Local Time:</b> Drinks'), '1:43 PM PKT & Local Time: Drinks');
    assert.deepEqual(richText('<b>10:00 AM IST:</b> Stumps'), [[[{ text: '9:30 AM PKT:', strong: true }, { text: ' Stumps' }]]]);
  });
});

describe('PKT stamps in the reader\u2019s zone', () => {
  // 2026-11-19 09:00 UTC, and a summer day for DST.
  const winter = Date.UTC(2026, 10, 19, 9);
  const summer = Date.UTC(2026, 6, 1, 9);

  it('leaves a reader in Pakistan on PKT', () => {
    const s = '1:43 PM PKT & Local Time: Drinks';
    assert.equal(pktToZone(s, 'Asia/Karachi', winter), s);
  });

  it('shows a reader in India IST, with the venue clock kept', () => {
    assert.equal(pktToZone('1:43 PM PKT & Local Time: Drinks', 'Asia/Kolkata', winter), '2:13 PM IST, 1:43 PM Local Time: Drinks');
  });

  it('reads DST for the note\u2019s day', () => {
    assert.equal(pktToZone('1:43 PM PKT: Drinks', 'Europe/London', winter), '8:43 AM GMT: Drinks');
    assert.equal(pktToZone('1:43 PM PKT: Drinks', 'Europe/London', summer), '9:43 AM BST: Drinks');
  });

  it('folds back to "& Local Time" when the reader shares the venue clock', () => {
    assert.equal(pktToZone('7:14 PM PKT, 7:44 PM Local Time', 'Asia/Kolkata', winter), '7:44 PM IST & Local Time');
    assert.equal(pktToZone('3:00 PM PKT, 11:00 AM Local Time', 'Asia/Dubai', winter), '2:00 PM GST, 11:00 AM Local Time');
    assert.equal(pktToZone('3:00 PM PKT', 'America/New_York', winter), '5:00 AM EST');
  });

  it('keeps 24-hour clocks two-digit and reads "and Local Time"', () => {
    assert.equal(pktToZone('09:00 PKT', 'Europe/London', winter), '04:00 GMT');
    assert.equal(pktToZone('1:43 PM PKT and Local Time', 'Europe/London', winter), '8:43 AM GMT, 1:43 PM Local Time');
  });

  it('crosses midnight against the note\u2019s time', () => {
    assert.equal(pktToZone('11:45 PM PKT', 'Asia/Kolkata', Date.UTC(2026, 10, 19, 18, 50)), '12:15 AM IST');
  });
});
