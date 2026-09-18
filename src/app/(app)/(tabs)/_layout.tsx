import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import { font, useColors } from '@/theme/tokens';

/**
 * Barre d'onglets des quatre destinations racines.
 *
 * `Tabs` (l'implémentation JavaScript) plutôt que `NativeTabs` : ce dernier est publié sous `expo-router/unstable-native-tabs` — API annoncée comme sujette à cassure — et délègue l'apparence aux conventions de la plateforme, ce qui interdit de reprendre les jetons du projet. Les onglets doivent porter l'accent « Carnet » et Bricolage Grotesque comme le reste de l'app.
 *
 * Les quatre routes sont les seules destinations racines : tout le reste (saisie, groupes, détail d'un budget ou d'un objectif) s'ouvre au-dessus, en pile ou en feuille, depuis le layout parent.
 */
export default function TabsLayout() {
  const colors = useColors();

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
          // La hauteur par défaut serre le libellé sous l'icône dès que la police système grossit.
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: font.semibold,
          fontSize: 11,
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
