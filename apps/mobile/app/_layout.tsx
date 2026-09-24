import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[RootLayout] Global React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Wystąpił błąd aplikacji</Text>
          <Text style={styles.errorMessage}>{this.state.error?.message || 'Nieznany błąd'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryText}>Zrestartuj widok</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#0B0F19' },
            headerTintColor: '#38BDF8',
            contentStyle: { backgroundColor: '#030712' },
            headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: 'et4u',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="(auth)/login"
            options={{
              title: 'Logowanie',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="projects/index"
            options={{
              title: 'Projekty',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="projects/[id]"
            options={{
              title: 'Szczegóły Projektu',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="tasks/[id]"
            options={{
              title: 'Szczegóły Zadania',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="tasks/create"
            options={{
              title: 'Nowe Zadanie',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="cables/index"
            options={{
              title: 'Kable & Bębny',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="circuits/index"
            options={{
              title: 'Rozdzielnice & BMA',
              headerShown: true,
            }}
          />
        </Stack>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#030712',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
});
