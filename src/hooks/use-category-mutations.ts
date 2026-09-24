import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createCategory, type Category, type CreateCategoryInput } from '@/data/categories';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création d'une catégorie personnalisée.
 *
 * La catégorie créée est ajoutée au cache du groupe avant toute relecture. Le formulaire la sélectionne dès le retour, et il écarte une sélection absente de la liste (voir TransactionForm) : attendre le rechargement la ferait désélectionner le temps d'un aller-retour réseau.
 */
export function useCategoryMutations() {
  const queryClient = useQueryClient();

  const createCategoryMutation = useMutation({
    mutationFn: (input: CreateCategoryInput) => createCategory(input),
    onSuccess: (created, input) => {
      // Le groupe vient des variables de la mutation, pas du groupe actif : la réponse peut arriver après un changement de groupe.
      queryClient.setQueryData<Category[]>(queryKeys.categories(input.groupId), (current) =>
        current
          ? [...current, created].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
          : current
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.categoriesAll() });
    },
  });

  return { createCategory: createCategoryMutation };
}
