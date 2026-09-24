import 'react-native-gesture-handler';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#030712' },
          headerTintColor: '#F8FAFC',
          contentStyle: { backgroundColor: '#030712' },
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'et4u',
            headerShown: false,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
