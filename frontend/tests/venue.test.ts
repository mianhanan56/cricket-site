import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanVenueName, venueText } from '../lib/venue';

describe('cleanVenueName', () => {
  it('strips invisible and private-use characters', () => {
    assert.equal(cleanVenueName('JB Marks Oval, Potchefstroom'), 'JB Marks Oval, Potchefstroom');
    assert.equal(cleanVenueName('Eden​ Gardens'), 'Eden Gardens');
  });

  it('tidies spacing and dangling separators', () => {
    assert.equal(cleanVenueName('  Barabati  Stadium , Cuttack, '), 'Barabati Stadium, Cuttack');
    assert.equal(cleanVenueName('- Lord’s -'), 'Lord’s');
  });

  it('reads every undecided venue as TBD', () => {
    for (const raw of ['', '   ', 'tbd', 'TBA', 'To be decided', undefined, null]) assert.equal(cleanVenueName(raw), 'TBD');
  });

  it('reads TBD as "Venue TBD" in running text', () => {
    assert.equal(venueText('TBA'), 'Venue TBD');
    assert.equal(venueText('Kingsmead, Durban'), 'Kingsmead, Durban');
  });

  it('leaves a valid name alone', () => {
    assert.equal(cleanVenueName('Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium'), 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium');
  });
});
