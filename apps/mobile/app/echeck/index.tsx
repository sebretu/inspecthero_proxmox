import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/useAuth';
import { useLanguage } from '../../src/i18n/LanguageContext';
import { authSupabase } from '../../src/auth/authClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface VdeProtocol {
  id: string;
  project_id: string;
  project_name?: string;
  title: string;
  protocol_number?: string;
  inspector_name?: string;
  inspection_date?: string;
  status: string;
  circuits_count?: number;
}

export default function ECheckScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { hasVdeAccess, isAdmin, loading: authLoading } = useAuth();

  const [protocols, setProtocols] = useState<VdeProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProtocols = useCallback(async () => {
    if (!hasVdeAccess && !isAdmin) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const res = await fetch(`${API_BASE_URL}/api/vde-protocols`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json?.data || []);
        setProtocols(list);
      }
    } catch (err) {
      console.warn('[ECheck] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hasVdeAccess, isAdmin]);

  useEffect(() => {
    if (!authLoading) {
      loadProtocols();
    }
  }, [authLoading, loadProtocols]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProtocols();
  };

  // If user does not have VDE / E-Check permission:
  if (!authLoading && !hasVdeAccess && !isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <Stack.Screen
          options={{
            title: '⚡ E-Check (VDE)',
            headerShown: true,
            headerBackTitle: 'Wróć',
            headerStyle: { backgroundColor: '#0B0F19' },
            headerTintColor: '#38BDF8',
            headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
          }}
        />
        <View style={styles.lockedContainer}>
          <View style={styles.lockIconBadge}>
            <Text style={{ fontSize: 36 }}>🔒</Text>
          </View>
          <Text style={styles.lockedHeading}>Brak uprawnień E-Check (VDE)</Text>
          <Text style={styles.lockedDesc}>
            Dostęp do modułu protokołów pomiarowych E-Check / VDE 0100/0105 wymaga specjalnego uprawnienia pomiarowego (has_vde_access) przyznawanego przez Administratora.
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.backBtnText}>← Powrót do menu</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: '⚡ E-Check (Protokoły Pomiarowe VDE)',
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie protokołów E-Check...</Text>
        </View>
      ) : (
        <FlatList
          data={protocols}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.title || item.protocol_number || 'Protokół pomiarowy VDE'}</Text>
                  <Text style={styles.cardSubtitle}>
                    {item.project_name ? `${item.project_name} • ` : ''}Data: {item.inspection_date || '—'}
                  </Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{item.status || 'AKTYWNY'}</Text>
                </View>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.inspectorText}>
                  Pomiarowiec: {item.inspector_name || 'Brak danych'}
                </Text>
                <Text style={styles.circuitCountText}>
                  Obwody: {item.circuits_count || 0}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>📋</Text>
              <Text style={styles.emptyTitle}>Brak utworzonych protokołów E-Check</Text>
              <Text style={styles.emptySub}>
                Protokoły pomiarowe VDE 0100-600 / 0105-100 pojawią się tutaj po synchronizacji z serwerem.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  statusText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
    marginTop: 4,
  },
  inspectorText: {
    fontSize: 11,
    color: '#64748B',
  },
  circuitCountText: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '700',
  },
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockedHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
    textAlign: 'center',
  },
  lockedDesc: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    maxWidth: 300,
  },
  backBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  backBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 13,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 280,
  },
});
