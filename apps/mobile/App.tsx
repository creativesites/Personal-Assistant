import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { AuthContext, useAuthProvider } from './src/hooks/useAuth';
import Navigation from './src/navigation';
import { MotionProvider } from './src/universe';

export default function App() {
  const auth = useAuthProvider();
  // Required individually so only the 7 weights the Universe uses get bundled
  // (the packages' index files pull in every weight, ~2.5 MB extra).
  const [fontsLoaded] = useFonts({
    Inter_400Regular: require('@expo-google-fonts/inter/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('@expo-google-fonts/inter/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('@expo-google-fonts/inter/Inter_800ExtraBold.ttf'),
    SpaceGrotesk_600SemiBold: require('@expo-google-fonts/space-grotesk/SpaceGrotesk_600SemiBold.ttf'),
    SpaceGrotesk_700Bold: require('@expo-google-fonts/space-grotesk/SpaceGrotesk_700Bold.ttf'),
  });

  return (
    <SafeAreaProvider>
      <MotionProvider>
        <AuthContext.Provider value={auth}>
          {fontsLoaded ? <Navigation /> : <View style={{ flex: 1, backgroundColor: '#03040B' }} />}
          <StatusBar style="light" />
        </AuthContext.Provider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}
