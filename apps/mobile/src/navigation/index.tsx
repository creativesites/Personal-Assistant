import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { ActivityIndicator, View } from 'react-native';

import LoginScreen from '../screens/LoginScreen';
import InboxScreen from '../screens/InboxScreen';
import ConversationScreen from '../screens/ConversationScreen';
import RelationshipsScreen from '../screens/RelationshipsScreen';
import ProactiveScreen from '../screens/ProactiveScreen';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Conversation: { conversationId: string; contactName: string };
};

export type TabParamList = {
  Inbox: undefined;
  Relationships: undefined;
  Proactive: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Inbox: focused ? 'chatbubbles' : 'chatbubbles-outline',
            Relationships: focused ? 'people' : 'people-outline',
            Proactive: focused ? 'bulb' : 'bulb-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#6200EE',
        tabBarInactiveTintColor: '#666',
      })}
    >
      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Relationships" component={RelationshipsScreen} />
      <Tab.Screen name="Proactive" component={ProactiveScreen} options={{ title: 'To-Do' }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#6200EE" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="Conversation"
              component={ConversationScreen}
              options={{ headerShown: true }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
