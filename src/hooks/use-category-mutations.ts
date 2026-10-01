import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  createCategory,
  deleteCategory,
  updateCategory,
  type Category,
  type CategoryPatch,
  type CreateCategoryInput,
} from '@/data/categories';
import { queryKeys } from '@/lib/query-keys';

/**
 * Une catégorie renommée ou supprimée se lit partout où elle s'affiche : les listes d'opérations et la répartition (sous ['transactions'], qui joignent son nom), les budgets et les modèles récurrents (qui la joignent aussi). Une suppression avec report change en plus la catégorie des opérations elles-mêmes.
 */
function invalidateCategoryReaders(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.categoriesAll() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.budgetsAll() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.recurringAll() });
}

/**
 * Création, modification et suppression d'une catégorie personnalisée.
 *
 * La catégorie créée est ajoutée au cache du groupe avant toute relecture. Le formulaire la sélectionne dès le retour, et il écarte une sélection absente de la liste (voir TransactionForm) : attendre le rechargement la ferait désélectionner le temps d'un aller-retour réseau.
 *
 * Modification et suppression échouent aussitôt hors ligne (« Pas de connexion ») : elles ne passent pas par la file des saisies, et une suppression rejouée plus tard pourrait emporter une catégorie qu'un autre membre vient d'utiliser.
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

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CategoryPatch }) => updateCategory(id, patch),
    onSuccess: () => invalidateCategoryReaders(queryClient),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: ({ id, replacementId }: { id: string; replacementId: string | null }) =>
      deleteCategory(id, replacementId),
    onSuccess: () => invalidateCategoryReaders(queryClient),
  });

  return {
    createCategory: createCategoryMutation,
    updateCategory: updateCategoryMutation,
    deleteCategory: deleteCategoryMutation,
  };
}
