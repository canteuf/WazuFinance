import { invitationLink, JOIN_PAGE_URL, joinCodeFromPath } from '@/lib/join-link';

describe('joinCodeFromPath', () => {
  it('lit le code d’un lien d’invitation, sous toutes ses formes', () => {
    expect(joinCodeFromPath('join/7KQ2M9XA')).toBe('7KQ2M9XA');
    expect(joinCodeFromPath('/join/7kq2-m9xa')).toBe('7KQ2M9XA');
    expect(joinCodeFromPath('wazufinance://join/7KQ2M9XA')).toBe('7KQ2M9XA');
    expect(joinCodeFromPath('/join/7KQ2%2DM9XA?utm=x')).toBe('7KQ2M9XA');
  });

  it('ignore tout autre chemin', () => {
    expect(joinCodeFromPath('/')).toBeNull();
    expect(joinCodeFromPath('/transaction?id=1')).toBeNull();
    expect(joinCodeFromPath('/rejoin/7KQ2M9XA')).toBeNull();
  });

  it('refuse un code incomplet ou trafiqué', () => {
    expect(joinCodeFromPath('/join/7KQ2')).toBeNull();
    expect(joinCodeFromPath('/join/%E0%A4%A')).toBeNull();
    expect(joinCodeFromPath('/join/<script>')).toBeNull();
  });
});

describe('invitationLink', () => {
  it('mène à la page de secours, code en paramètre', () => {
    expect(invitationLink('7KQ2M9XA')).toBe(`${JOIN_PAGE_URL}?code=7KQ2M9XA`);
  });
});
