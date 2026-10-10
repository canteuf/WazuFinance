import type { ImageSourcePropType } from 'react-native';

import type { AvatarId } from '@/lib/avatars';

/**
 * Une image par identifiant, chacune avec son `require` écrit en toutes lettres : Metro résout les ressources à la compilation et n'accepte pas un chemin construit.
 *
 * `Record<AvatarId, …>` fait échouer tsc si un identifiant de la liste n'a pas son image, et l'inverse aussi.
 */
export const AVATAR_SOURCES: Record<AvatarId, ImageSourcePropType> = {
  a01: require('../../../assets/avatars/a01.png'),
  a02: require('../../../assets/avatars/a02.png'),
  a03: require('../../../assets/avatars/a03.png'),
  a04: require('../../../assets/avatars/a04.png'),
  a05: require('../../../assets/avatars/a05.png'),
  a06: require('../../../assets/avatars/a06.png'),
  a07: require('../../../assets/avatars/a07.png'),
  a08: require('../../../assets/avatars/a08.png'),
  a09: require('../../../assets/avatars/a09.png'),
  a10: require('../../../assets/avatars/a10.png'),
  a11: require('../../../assets/avatars/a11.png'),
  a12: require('../../../assets/avatars/a12.png'),
  a13: require('../../../assets/avatars/a13.png'),
  a14: require('../../../assets/avatars/a14.png'),
  a15: require('../../../assets/avatars/a15.png'),
  a16: require('../../../assets/avatars/a16.png'),
  a17: require('../../../assets/avatars/a17.png'),
  a18: require('../../../assets/avatars/a18.png'),
  a19: require('../../../assets/avatars/a19.png'),
  a20: require('../../../assets/avatars/a20.png'),
  a21: require('../../../assets/avatars/a21.png'),
  a22: require('../../../assets/avatars/a22.png'),
  a23: require('../../../assets/avatars/a23.png'),
  a24: require('../../../assets/avatars/a24.png'),
  a25: require('../../../assets/avatars/a25.png'),
  a26: require('../../../assets/avatars/a26.png'),
  a27: require('../../../assets/avatars/a27.png'),
  a28: require('../../../assets/avatars/a28.png'),
  a29: require('../../../assets/avatars/a29.png'),
  a30: require('../../../assets/avatars/a30.png'),
  a31: require('../../../assets/avatars/a31.png'),
};
