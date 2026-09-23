/**
 * Fondu enchaîné entre deux thèmes : on photographie l'écran, on pose la photo par-dessus, on change le thème dessous, puis on efface la photo. L'ancien écran s'efface directement sur le nouveau, sans image unie entre les deux.
 *
 * Ce module ne connaît ni React ni la capture d'écran : la photo, son affichage et son fondu sont fournis par un `TransitionHost`. Les cas de course — deux choix rapprochés, capture lente, image qui ne se charge pas — se testent ainsi sous Jest avec de fausses minuteries, alors qu'ils sont introuvables à la main.
 *
 * Quatre phases :
 * - `idle` : rien en cours.
 * - `capturing` : la photo est demandée ; le thème n'a pas changé.
 * - `covering` : la photo est montée, pas encore chargée ni peinte. Le thème ne change qu'une fois qu'elle l'est : c'est ce qui évite de voir le nouveau thème une image avant qu'elle ne le recouvre.
 * - `revealing` : le thème a changé, la photo s'efface.
 *
 * Un nouveau choix pendant `capturing` ou `covering` remplace le choix en attente : seul le dernier thème demandé s'applique, une fois. Pendant `revealing`, il s'applique tout de suite sous la photo, qui remonte brièvement avant de repartir : la photo montre toujours l'ancien thème, la reprendre coûterait une capture de l'écran déjà à moitié changé.
 *
 * Chaque attente porte un garde-fou. Sans eux, une capture qui ne revient pas ou une image qui ne signale jamais son chargement laisserait l'écran figé sur l'ancien thème, et sans rien qui le dise.
 */

export type TransitionHost = {
  /** Photographie l'écran tel qu'il est. Rejette, ou lève, quand la capture est impossible : module natif absent d'un ancien build, vue introuvable. */
  capture: () => Promise<string>;
  /** Libère le fichier d'une photo dont on n'a plus besoin. */
  release: (uri: string) => void;
  /** Monte la photo, opaque, au-dessus de l'écran. */
  showSnapshot: (uri: string) => void;
  /** Fait glisser l'opacité de la photo vers `opacity`. */
  fade: (opacity: 0 | 1, durationMs: number) => void;
  /** Démonte la photo. */
  hideSnapshot: () => void;
};

export type TransitionTimings = {
  /** Au-delà, on renonce au fondu et le thème change tout de suite : mieux vaut un changement sec qu'un clic sans effet. */
  captureTimeoutMs: number;
  /** Attente maximale du signal de chargement de la photo, avant de continuer sans lui. */
  loadTimeoutMs: number;
  /** Marge entre le chargement de la photo et le changement de thème, pour que la photo soit effectivement peinte. */
  paintMs: number;
  /** Marge entre le changement de thème et le début du retrait, le temps que l'arbre se recompose sous la photo. */
  settleMs: number;
  /** Durée du fondu lui-même. */
  revealMs: number;
  /** Remontée rapide de la photo quand un nouveau choix arrive pendant le retrait. */
  recoverMs: number;
};

type Phase = 'idle' | 'capturing' | 'covering' | 'revealing';

/** Marge après la fin du fondu avant de démonter la photo, pour ne pas la retirer sur sa dernière image. */
const UNMOUNT_MARGIN_MS = 50;

export function createThemeTransition(host: TransitionHost, timings: TransitionTimings) {
  let phase: Phase = 'idle';
  let pending: (() => void) | null = null;
  let uri: string | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  // Change à chaque capture abandonnée (délai dépassé, interruption) : une photo qui arrive sous une ancienne génération est libérée sans être montrée.
  let generation = 0;

  function later(callback: () => void, delayMs: number) {
    timers.push(setTimeout(callback, delayMs));
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function applyPending() {
    const apply = pending;
    pending = null;
    apply?.();
  }

  function finish() {
    clearTimers();
    host.hideSnapshot();
    if (uri !== null) {
      host.release(uri);
      uri = null;
    }
    phase = 'idle';
  }

  function reveal(delayMs: number) {
    phase = 'revealing';
    clearTimers();
    later(() => {
      host.fade(0, timings.revealMs);
      later(finish, timings.revealMs + UNMOUNT_MARGIN_MS);
    }, delayMs);
  }

  function commit() {
    applyPending();
    reveal(timings.settleMs);
  }

  function takeSnapshot() {
    phase = 'capturing';
    const mine = ++generation;

    const stale = () => mine !== generation || phase !== 'capturing';

    later(() => {
      if (stale()) {
        return;
      }
      generation += 1;
      phase = 'idle';
      applyPending();
    }, timings.captureTimeoutMs);

    let shot: Promise<string>;
    try {
      shot = host.capture();
    } catch (error) {
      shot = Promise.reject(error);
    }

    shot.then(
      (taken) => {
        if (stale()) {
          host.release(taken);
          return;
        }
        clearTimers();
        uri = taken;
        phase = 'covering';
        host.showSnapshot(taken);
        later(commit, timings.loadTimeoutMs);
      },
      () => {
        if (stale()) {
          return;
        }
        clearTimers();
        phase = 'idle';
        applyPending();
      }
    );
  }

  return {
    /** Joue le fondu autour de `apply`, qui doit changer le thème. */
    run(apply: () => void) {
      if (phase === 'capturing' || phase === 'covering') {
        pending = apply;
        return;
      }
      if (phase === 'revealing') {
        apply();
        host.fade(1, timings.recoverMs);
        reveal(timings.recoverMs + timings.settleMs);
        return;
      }
      pending = apply;
      takeSnapshot();
    },

    /** La photo montée est chargée : on la laisse un instant se peindre, puis le thème change. */
    snapshotLoaded() {
      if (phase !== 'covering') {
        return;
      }
      clearTimers();
      later(commit, timings.paintMs);
    },

    /** La photo ne s'est pas chargée : le thème change sans fondu, et la photo est retirée. */
    snapshotFailed() {
      if (phase !== 'covering') {
        return;
      }
      applyPending();
      finish();
    },

    /** Interrompt tout, sans changer le thème : le composant qui l'utilisait est démonté. */
    dispose() {
      generation += 1;
      clearTimers();
      pending = null;
      if (uri !== null) {
        host.release(uri);
        uri = null;
      }
      phase = 'idle';
    },
  };
}
