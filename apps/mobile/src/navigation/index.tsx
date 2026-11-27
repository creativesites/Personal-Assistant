import React from 'react';
import { DarkTheme, NavigationContainer, NavigatorScreenParams, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../hooks/useAuth';
import { colors, Dock, LoadingOrb, SpaceScreen } from '../universe';

import LoginScreen from '../screens/LoginScreen';
import InboxScreen from '../screens/InboxScreen';
import ConversationScreen from '../screens/ConversationScreen';
import RelationshipsScreen from '../screens/RelationshipsScreen';
import ProactiveScreen from '../screens/ProactiveScreen';

export type TabParamList = {
  Inbox: undefined; // "Signals"
  Relationships: undefined; // "Orbits"
  Proactive: undefined; // "Missions"
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Conversation: { conversationId: string; contactName: string; contactId?: string; healthScore?: number | null };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Dark theme so no white frame ever flashes between screens.
const UNIVERSE_THEME: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.void,
    card: colors.space,
    text: colors.ink,
    border: 'transparent',
    primary: colors.ion,
    notification: colors.ion,
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <Dock {...props} />}
      sceneContainerStyle={{ backgroundColor: colors.void }}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Inbox" component={InboxScreen} options={{ title: 'Signals' }} />
      <Tab.Screen name="Relationships" component={RelationshipsScreen} options={{ title: 'Orbits' }} />
      <Tab.Screen name="Proactive" component={ProactiveScreen} options={{ title: 'Missions' }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <SpaceScreen>
        <LoadingOrb />
      </SpaceScreen>
    );
  }

  return (
    <NavigationContainer theme={UNIVERSE_THEME}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.void }, animation: 'fade_from_bottom' }}>
        {token ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Conversation" component={ConversationScreen} options={{ animation: 'slide_from_right' }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
