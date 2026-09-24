import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';

interface MaterialItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_price: number;
}

interface OrderItemEntry {
  material: MaterialItem;
  quantity: number;
}

export default function OrdersScreen() {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderNotes, setOrderNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadMaterials = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      let rows = await db.getAllAsync<MaterialItem>(
        'SELECT * FROM materials WHERE deleted_at IS NULL ORDER BY name ASC;'
      );

      if (rows.length === 0) {
        // Seed standard construction materials
        const now = new Date().toISOString();
        await db.execAsync(`
          INSERT OR IGNORE INTO materials (id, name, category, unit, unit_price, in_stock, created_at, updated_at, version)
          VALUES
            ('mat-001', 'Kabel YDYp 3x1.5mm² 750V', 'Kable', 'mb', 3.80, 500, '${now}', '${now}', 1),
            ('mat-002', 'Kabel YDYp 3x2.5mm² 750V', 'Kable', 'mb', 5.90, 350, '${now}', '${now}', 1),
            ('mat-003', 'Puszka podtynkowa głęboka fi60', 'Osprzęt', 'szt', 2.20, 200, '${now}', '${now}', 1),
            ('mat-004', 'Złączka WAGO 3x2.5 (221-413)', 'Osprzęt', 'szt', 1.45, 1000, '${now}', '${now}', 1),
            ('mat-005', 'Wyłącznik nadprądowy B16A 1P', 'Aparatura', 'szt', 14.50, 45, '${now}', '${now}', 1),
            ('mat-006', 'Rura karbowana peszel 20mm (50m)', 'Trasy', 'rolka', 48.00, 15, '${now}', '${now}', 1);
        `);
        rows = await db.getAllAsync<MaterialItem>(
          'SELECT * FROM materials WHERE deleted_at IS NULL ORDER BY name ASC;'
        );
      }

      setMaterials(rows);
    } catch (err) {
      console.error('[OrdersScreen] Error loading materials:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const updateQuantity = (materialId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[materialId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[materialId];
        return copy;
      }
      return { ...prev, [materialId]: next };
    });
  };

  const totalCartItems = Object.values(cart).reduce((a, b) => a + b, 0);

  const handleSubmitOrder = async () => {
    if (totalCartItems === 0) {
      Alert.alert('Pusty koszyk', 'Wybierz materiały przed złożeniem zapotrzebowania.');
      return;
    }

    try {
      setSubmitting(true);
      const db = await getDatabase();
      const orderId = `ord-${Date.now()}`;
      const now = new Date().toISOString();

      // 1. Insert order
      await db.runAsync(`
        INSERT INTO orders (id, project_id, user_id, status, notes, created_at, updated_at, version)
        VALUES (?, 'proj-sample-001', 'offline_user', 'submitted', ?, ?, ?, 1);
      `, [orderId, orderNotes.trim() || null, now, now]);

      // 2. Insert order items
      for (const [matId, qty] of Object.entries(cart)) {
        const itemId = `itm-${Date.now()}-${matId}`;
        const mat = materials.find((m) => m.id === matId);
        await db.runAsync(`
          INSERT INTO order_items (id, order_id, material_id, quantity, unit_price, created_at, updated_at, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1);
        `, [itemId, orderId, matId, qty, mat?.unit_price || 0, now, now]);
      }

      // 3. Queue mutation
      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'orders', ?, 'INSERT', 0, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${orderId}`,
        orderId,
        JSON.stringify({
          project_id: 'proj-sample-001',
          notes: orderNotes.trim() || null,
          items: cart,
          created_at: now,
        }),
        now,
        now,
      ]);

      setCart({});
      setOrderNotes('');
      Alert.alert('Zapotrzebowanie wysłane', 'Zamówienie materiałów zostało zarejestrowane offline i oczekuje w kolejce do synchronizacji z magazynem.');
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się złożyć zapotrzebowania');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Zapotrzebowanie Materiałowe',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : (
        <View style={styles.content}>
          <FlatList
            data={materials}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.headerBox}>
                <Text style={styles.headerTitle}>Katalog materiałowy budowy</Text>
                <Text style={styles.headerSubtitle}>Wybierz ilości materiałów do dostarczenia na obiekt.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const qty = cart[item.id] || 0;
              return (
                <View style={styles.card}>
                  <View style={styles.cardMain}>
                    <Text style={styles.matName}>{item.name}</Text>
                    <Text style={styles.matCategory}>{item.category} • {item.unit}</Text>
                  </View>

                  <View style={styles.qtyControl}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, -1)}
                    >
                      <Text style={styles.qtyBtnText}>-</Text>
                    </TouchableOpacity>

                    <Text style={styles.qtyText}>{qty}</Text>

                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, 1)}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />

          {/* Cart & Submit Footer */}
          {totalCartItems > 0 && (
            <View style={styles.footer}>
              <TextInput
                style={styles.notesInput}
                placeholder="Uwagi do dostawy (np. rozładunek brama wschodnia)..."
                placeholderTextColor="#64748B"
                value={orderNotes}
                onChangeText={setOrderNotes}
              />

              <TouchableOpacity
                style={styles.submitBtn}
                activeOpacity={0.8}
                onPress={handleSubmitOrder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    Złóż zapotrzebowanie ({totalCartItems} pozycji) ➔
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingBottom: 120,
  },
  headerBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardMain: {
    flex: 1,
    marginRight: 12,
  },
  matName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  matCategory: {
    fontSize: 12,
    color: '#38BDF8',
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#030712',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  qtyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  qtyBtnText: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '800',
  },
  qtyText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0B0F19',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  notesInput: {
    backgroundColor: '#030712',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
