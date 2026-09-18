import type { ImperativeRouter } from 'expo-router';

import { goBackOr } from './navigation';

function routerStub(canGoBack: boolean) {
  return {
    canGoBack: () => canGoBack,
    back: jest.fn(),
    dismissTo: jest.fn(),
  } as unknown as ImperativeRouter & {
    back: jest.Mock;
    dismissTo: jest.Mock;
  };
}

describe('goBackOr', () => {
  it('revient en arrière quand la pile a un écran précédent', () => {
    const router = routerStub(true);

    goBackOr(router, '/groups');

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('retombe sur la route de repli quand la pile est vide', () => {
    const router = routerStub(false);

    goBackOr(router, '/groups');

    expect(router.dismissTo).toHaveBeenCalledWith('/groups');
    expect(router.back).not.toHaveBeenCalled();
  });
});
