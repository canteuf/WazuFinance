import {
  createThemeTransition,
  type TransitionHost,
  type TransitionTimings,
} from '@/lib/theme-transition';

const TIMINGS: TransitionTimings = {
  captureTimeoutMs: 1000,
  loadTimeoutMs: 800,
  paintMs: 50,
  settleMs: 60,
  revealMs: 250,
  recoverMs: 80,
};

type Deferred = { resolve: (uri: string) => void; reject: (error: Error) => void };

/** Un hôte factice : chaque appel est noté dans `events`, et la capture reste en suspens jusqu'à ce que le test la résolve. */
function makeHost(options: { captureThrows?: boolean } = {}) {
  const events: string[] = [];
  const captures: Deferred[] = [];
  const host: TransitionHost = {
    capture: () => {
      events.push('capture');
      if (options.captureThrows) {
        throw new Error('module natif absent');
      }
      return new Promise<string>((resolve, reject) => {
        captures.push({ resolve, reject });
      });
    },
    release: (uri) => events.push(`release:${uri}`),
    showSnapshot: (uri) => events.push(`show:${uri}`),
    fade: (opacity, durationMs) => events.push(`fade:${opacity}:${durationMs}`),
    hideSnapshot: () => events.push('hide'),
  };
  return { host, events, captures };
}

/** Laisse les promesses en attente se résoudre, puis fait avancer les minuteries factices. */
async function advance(ms: number) {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createThemeTransition', () => {
  it('photographie, change le thème sous la photo, puis l’efface', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const apply = jest.fn(() => events.push('apply'));

    transition.run(apply);
    expect(events).toEqual(['capture']);

    captures[0].resolve('file:///a.png');
    await advance(0);
    expect(events).toEqual(['capture', 'show:file:///a.png']);
    // Le thème ne change pas tant que la photo n'est pas posée : c'est ce qui évite l'image unie.
    expect(apply).not.toHaveBeenCalled();

    transition.snapshotLoaded();
    await advance(TIMINGS.paintMs - 1);
    expect(apply).not.toHaveBeenCalled();
    await advance(1);
    expect(apply).toHaveBeenCalledTimes(1);

    await advance(TIMINGS.settleMs);
    expect(events).toContain('fade:0:250');

    await advance(TIMINGS.revealMs + 100);
    expect(events).toEqual([
      'capture',
      'show:file:///a.png',
      'apply',
      'fade:0:250',
      'hide',
      'release:file:///a.png',
    ]);
  });

  it('peut recommencer une fois la transition finie', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);

    transition.run(() => {});
    captures[0].resolve('file:///a.png');
    await advance(0);
    transition.snapshotLoaded();
    await advance(TIMINGS.paintMs + TIMINGS.settleMs + TIMINGS.revealMs + 100);

    transition.run(() => {});
    expect(events.filter((event) => event === 'capture')).toHaveLength(2);
  });

  it('change le thème tout de suite quand la capture est refusée', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const apply = jest.fn();

    transition.run(apply);
    captures[0].reject(new Error('vue introuvable'));
    await advance(0);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['capture']);
  });

  it('change le thème tout de suite quand la capture lève une erreur', async () => {
    const { host, events } = makeHost({ captureThrows: true });
    const transition = createThemeTransition(host, TIMINGS);
    const apply = jest.fn();

    transition.run(apply);
    await advance(0);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['capture']);
  });

  it('renonce au fondu quand la capture traîne, et libère la photo si elle arrive après', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const apply = jest.fn();

    transition.run(apply);
    await advance(TIMINGS.captureTimeoutMs);
    expect(apply).toHaveBeenCalledTimes(1);

    captures[0].resolve('file:///tard.png');
    await advance(0);
    // Trop tard : la photo ne doit ni s'afficher, ni rester sur le disque.
    expect(events).toEqual(['capture', 'release:file:///tard.png']);
  });

  it('ne garde que le dernier choix quand deux arrivent pendant la capture', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const first = jest.fn();
    const second = jest.fn();

    transition.run(first);
    transition.run(second);
    expect(events.filter((event) => event === 'capture')).toHaveLength(1);

    captures[0].resolve('file:///a.png');
    await advance(0);
    transition.snapshotLoaded();
    await advance(TIMINGS.paintMs);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('ne garde que le dernier choix quand un autre arrive sous la photo', async () => {
    const { host, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const first = jest.fn();
    const second = jest.fn();

    transition.run(first);
    captures[0].resolve('file:///a.png');
    await advance(0);
    transition.run(second);
    transition.snapshotLoaded();
    await advance(TIMINGS.paintMs);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('continue même si la photo ne signale jamais son chargement', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const apply = jest.fn();

    transition.run(apply);
    captures[0].resolve('file:///a.png');
    await advance(0);

    await advance(TIMINGS.loadTimeoutMs);
    expect(apply).toHaveBeenCalledTimes(1);

    // Sans ce garde-fou, une image qui ne se charge pas figerait l'écran sur l'ancien thème.
    await advance(TIMINGS.settleMs + TIMINGS.revealMs + 100);
    expect(events.slice(-2)).toEqual(['hide', 'release:file:///a.png']);
  });

  it('change le thème sans fondu quand la photo échoue à se charger', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const apply = jest.fn();

    transition.run(apply);
    captures[0].resolve('file:///a.png');
    await advance(0);
    transition.snapshotFailed();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['capture', 'show:file:///a.png', 'hide', 'release:file:///a.png']);
  });

  it('applique tout de suite un choix qui arrive pendant le retrait, et relève la photo', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const first = jest.fn();
    const second = jest.fn();

    transition.run(first);
    captures[0].resolve('file:///a.png');
    await advance(0);
    transition.snapshotLoaded();
    await advance(TIMINGS.paintMs + TIMINGS.settleMs);
    expect(events).toContain('fade:0:250');

    transition.run(second);
    expect(second).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toBe(`fade:1:${TIMINGS.recoverMs}`);
    // Pas de nouvelle capture : la photo de l'ancien thème est toujours là.
    expect(events.filter((event) => event === 'capture')).toHaveLength(1);

    await advance(TIMINGS.recoverMs + TIMINGS.settleMs + TIMINGS.revealMs + 100);
    expect(events.filter((event) => event === 'hide')).toHaveLength(1);
    expect(events.filter((event) => event.startsWith('release:'))).toHaveLength(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('ignore un signal de chargement qui n’a plus de sens', async () => {
    const { host, events } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);

    transition.snapshotLoaded();
    transition.snapshotFailed();
    await advance(5000);

    expect(events).toEqual([]);
  });

  it('libère la photo et cesse tout quand on l’interrompt', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);
    const apply = jest.fn();

    transition.run(apply);
    captures[0].resolve('file:///a.png');
    await advance(0);
    transition.dispose();
    expect(events).toEqual(['capture', 'show:file:///a.png', 'release:file:///a.png']);

    // Plus aucune minuterie ne survit : ni changement de thème, ni retrait sur un composant démonté.
    await advance(5000);
    expect(events).toEqual(['capture', 'show:file:///a.png', 'release:file:///a.png']);
    expect(apply).not.toHaveBeenCalled();
  });

  it('libère aussi une photo qui arrive après l’interruption', async () => {
    const { host, events, captures } = makeHost();
    const transition = createThemeTransition(host, TIMINGS);

    transition.run(() => {});
    transition.dispose();
    captures[0].resolve('file:///a.png');
    await advance(0);

    expect(events).toEqual(['capture', 'release:file:///a.png']);
  });
});
