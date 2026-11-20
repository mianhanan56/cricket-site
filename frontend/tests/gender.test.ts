import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterByGender, isWomens } from '../lib/gender';

const match = (series: string, home: string, away: string) => ({
  series: { id: 's', name: series },
  homeTeam: { name: home },
  awayTeam: { name: away },
});

describe("men's and women's fixtures", () => {
  it('reads women from the series or either side', () => {
    assert.equal(isWomens(match("Senior Women's T20 Trophy Elite 2026-27", 'Karnataka Women', 'Railways Women') as never), true);
    assert.equal(isWomens(match('Womens Big Bash League 2026', 'Team 1 (TBC)', 'Team 2 (TBC)') as never), true);
    assert.equal(isWomens(match('Tri-Series 2026', 'India', 'Pakistan Women') as never), true);
    assert.equal(isWomens({ ...match('Charlotte Edwards Cup', 'Southern Vipers', 'Northern Diamonds'), homeTeam: { name: 'Southern Vipers', shortName: 'SV-W' } } as never), true);
  });

  it("leaves men's cricket and look-alike words alone", () => {
    assert.equal(isWomens(match('Syed Mushtaq Ali Trophy Elite 2026', 'Vidarbha', 'Mumbai') as never), false);
    assert.equal(isWomens(match('Westward Cup', 'Wolves', 'Womersley CC') as never), false);
  });

  it('filters a list both ways and keeps everything for all', () => {
    const list = [match('Ranji Trophy', 'Delhi', 'Assam'), match("Women's Super Smash", 'Auckland Women', 'Otago Women')] as never[];
    assert.equal(filterByGender(list, 'all').length, 2);
    assert.equal(filterByGender(list, 'men').length, 1);
    assert.equal(filterByGender(list, 'women').length, 1);
  });
});
