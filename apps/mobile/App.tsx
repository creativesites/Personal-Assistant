import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthContext, useAuthProvider } from './src/hooks/useAuth';
import Navigation from './src/navigation';

export default function App() {
  const auth = useAuthProvider();

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={auth}>
        <Navigation />
        <StatusBar style="auto" />
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}
