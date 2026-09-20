import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, useColors } from '@/theme/tokens';

/** Hauteur de la barre elle-même, hors zone sûre : une icône, son libellé, et de quoi respirer. */
const BAR_HEIGHT = 60;

/**
 * Barre d'onglets des quatre destinations racines.
 *
 * `Tabs` (l'implémentation JavaScript) plutôt que `NativeTabs` : ce dernier est publié sous `expo-router/unstable-native-tabs` — API annoncée comme sujette à cassure — et délègue l'apparence aux conventions de la plateforme, ce qui interdit de reprendre les jetons du projet. Les onglets doivent porter l'accent « Carnet » et Bricolage Grotesque comme le reste de l'app.
 *
 * Les quatre routes sont les seules destinations racines : tout le reste (saisie, groupes, détail d'un budget ou d'un objectif) s'ouvre au-dessus, en pile ou en feuille, depuis le layout parent.
 */
export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // Sans cette ligne, RN pose une bordure d'un point plein qui se lit comme un trait gris sur le fond « Carnet ».
          borderTopWidth: StyleSheet.hairlineWidth,
          // La hauteur se déduit du contenu plus la zone sûre du bas, elle n'est pas fixée : une hauteur en dur ignore la barre de gestes Android et le libellé se fait couper par elle. `insets.bottom` vaut zéro sur un appareil à boutons physiques, où seul le rembourrage de base subsiste.
          height: BAR_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontFamily: font.semibold,
          fontSize: 13,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Synthèse',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'view-dashboard' : 'view-dashboard-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'chart-donut' : 'chart-donut-variant'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Opérations',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'receipt' : 'receipt-text-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="savings-goals"
        options={{
          title: 'Épargne',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'piggy-bank' : 'piggy-bank-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
