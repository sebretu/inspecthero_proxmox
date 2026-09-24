import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';

export default function CreateTaskScreen() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Wymagane pole', 'Wprowadź tytuł zadania.');
      return;
    }

    try {
      setLoading(true);
      const db = await getDatabase();
      const taskId = `tsk-mob-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const now = new Date().toISOString();
      const targetPlanId = planId || 'pln-sample-001';

      // 1. Insert into local SQLite
      await db.runAsync(`
        INSERT INTO tasks (
          id, plan_id, title, description, status, priority, pos_x, pos_y, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, 'open', ?, 500, 500, ?, ?, 1);
      `, [taskId, targetPlanId, title.trim(), description.trim() || null, priority, now, now]);

      // 2. Queue mutation in outbox
      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'tasks', ?, 'INSERT', 0, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${taskId}`,
        taskId,
        JSON.stringify({
          plan_id: targetPlanId,
          title: title.trim(),
          description: description.trim() || null,
          status: 'open',
          priority,
          created_at: now,
        }),
        now,
        now,
      ]);

      Alert.alert('Zapisano', 'Zadanie zostało utworzone w lokalnej bazie offline.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się utworzyć zadania w SQLite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Nowe Zadanie',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>TYTUŁ ZADANIA / USTERKI</Text>
            <TextInput
              style={styles.input}
              placeholder="np. Montaż puszki łączeniowej w pokoju 102"
              placeholderTextColor="#64748B"
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>OPIS SZCZEGÓŁOWY</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Wprowadź dodatkowe instrukcje montażowe..."
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PRIORYTET</Text>
            <View style={styles.priorityRow}>
              {(['low', 'normal', 'high', 'urgent'] as const).map((pr) => {
                const isSelected = priority === pr;
                return (
                  <TouchableOpacity
                    key={pr}
                    style={[styles.priorityBtn, isSelected && styles.priorityBtnActive]}
                    onPress={() => setPriority(pr)}
                  >
                    <Text style={[styles.priorityBtnText, isSelected && styles.priorityBtnTextActive]}>
                      {pr.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={styles.submitBtn}
            activeOpacity={0.8}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Utwórz zadanie offline</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  scroll: {
    padding: 16,
  },
  form: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#030712',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F8FAFC',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  priorityBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  priorityBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
  },
  priorityBtnTextActive: {
    color: '#38BDF8',
  },
  submitBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
