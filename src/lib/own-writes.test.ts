import { OWN_WRITE_ECHO_MS, OwnWrites } from '@/lib/own-writes';

describe('OwnWrites', () => {
  it('reconnaît l’écho d’une ligne écrite ici', () => {
    const writes = new OwnWrites();
    writes.record('a', 1_000);
    expect(writes.isEcho('a', 2_000)).toBe(true);
  });

  it('ne retient pas une ligne écrite ailleurs', () => {
    const writes = new OwnWrites();
    writes.record('a', 1_000);
    expect(writes.isEcho('b', 2_000)).toBe(false);
    expect(writes.isEcho(undefined, 2_000)).toBe(false);
  });

  it('oublie une écriture passé le délai : une modification plus tardive d’un autre membre recharge', () => {
    const writes = new OwnWrites();
    writes.record('a', 1_000);
    expect(writes.isEcho('a', 1_000 + OWN_WRITE_ECHO_MS + 1)).toBe(false);
  });
});
