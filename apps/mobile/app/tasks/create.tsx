import React, { useState, useEffect } from 'react';
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
import { authSupabase } from '../../src/auth/authClient';
import { useLanguage } from '../../src/i18n/LanguageContext';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

export default function CreateTaskScreen() {
  const { planId, type: initialType } = useLocalSearchParams<{ planId?: string; type?: string }>();
  const router = useRouter();
  const { t } = useLanguage();

  const [itemType, setItemType] = useState<'task' | 'question' | 'revision' | 'fehler'>(
    (initialType as any) || 'task'
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialType && ['task', 'question', 'revision', 'fehler'].includes(initialType)) {
      setItemType(initialType as any);
    }
  }, [initialType]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Wymagane pole', 'Wprowadź tytuł wpisu.');
      return;
    }

    try {
      setLoading(true);
      const db = await getDatabase();
      const targetPlanId = planId || 'pln-sample-001';
      const now = new Date().toISOString();
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      if (itemType === 'revision') {
        const revId = `rev-${Date.now()}`;
        if (session?.access_token) {
          await fetch(`${API_BASE_URL}/api/revisions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title: title.trim(),
              description: description.trim() || undefined,
              plan_id: targetPlanId,
            }),
          }).catch(() => {});
        }
      } else if (itemType === 'fehler') {
        const fehlerId = `fhl-${Date.now()}`;
        if (session?.access_token) {
          await fetch(`${API_BASE_URL}/api/fehler`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title: title.trim(),
              description: description.trim() || undefined,
              priority,
              plan_id: targetPlanId,
            }),
          }).catch(() => {});
        }
      } else {
        // Task or Question
        const taskId = `tsk-mob-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const isQuestion = itemType === 'question';

        await db.runAsync(`
          INSERT INTO tasks (
            id, plan_id, title, description, status, priority, pos_x, pos_y, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, 'open', ?, 500, 500, ?, ?, 1);
        `, [taskId, targetPlanId, title.trim(), description.trim() || null, priority, now, now]);

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
            is_question: isQuestion,
            created_at: now,
          }),
          now,
          now,
        ]);
      }

      Alert.alert('Zapisano', 'Wpis został pomyślnie utworzony.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zapisać wpisu.');
    } finally {
      setLoading(false);
    }
  };

  const getTheme = () => {
    switch (itemType) {
      case 'question':
        return { color: '#6366F1', icon: '❓', name: 'Nowe Pytanie / Info' };
      case 'revision':
        return { color: '#14B8A6', icon: '📋', name: 'Nowa Rewizja (Revision)' };
      case 'fehler':
        return { color: '#EF4444', icon: '⚠️', name: 'Nowy Błąd (Fehler)' };
      default:
        return { color: '#F59E0B', icon: '✓', name: 'Nowe Zadanie (Task)' };
    }
  };

  const theme = getTheme();

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: `${theme.icon} ${theme.name}`,
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: theme.color,
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Type Switcher */}
        <View style={styles.typeSelectorRow}>
          {[
            { id: 'task', label: '✓ Zadanie', color: '#F59E0B' },
            { id: 'question', label: '? Pytanie', color: '#6366F1' },
            { id: 'revision', label: '📋 Rewizja', color: '#14B8A6' },
            { id: 'fehler', label: '⚠️ Błąd', color: '#EF4444' },
          ].map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.typeBtn,
                itemType === t.id && { backgroundColor: `${t.color}25`, borderColor: t.color },
              ]}
              onPress={() => setItemType(t.id as any)}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  itemType === t.id && { color: t.color, fontWeight: '800' },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>TYTUŁ / TEMAT WPISU *</Text>
            <TextInput
              style={styles.input}
              placeholder={
                itemType === 'question'
                  ? 'np. Czy zasilanie w pokoju 102 ma być z UV-1?'
                  : itemType === 'revision'
                  ? 'np. Zmiana trasy kablowej w korytarzu EG'
                  : itemType === 'fehler'
                  ? 'np. Uszkodzony przewód przy rozdzielnicy'
                  : 'np. Montaż puszki łączeniowej w pokoju 102'
              }
              placeholderTextColor="#64748B"
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>SZCZEGÓŁOWY OPIS</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Wprowadź szczegółowe wytyczne, uwagi montażowe lub treść pytania..."
              placeholderTextColor="#64748B"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PRIORYTET</Text>
            <View style={styles.priorityContainer}>
              {[
                { key: 'low', label: 'Niski', color: '#10B981' },
                { key: 'normal', label: 'Normalny', color: '#38BDF8' },
                { key: 'high', label: 'Wysoki', color: '#F59E0B' },
                { key: 'urgent', label: 'Pilny', color: '#EF4444' },
              ].map((p) => {
                const isSelected = priority === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.priorityButton,
                      isSelected && {
                        backgroundColor: `${p.color}25`,
                        borderColor: p.color,
                      },
                    ]}
                    onPress={() => setPriority(p.key as any)}
                  >
                    <Text
                      style={[
                        styles.priorityText,
                        isSelected && { color: p.color, fontWeight: '800' },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.color }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.saveButtonText}>Zapisz {theme.name}</Text>
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
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  typeBtnText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  form: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  priorityText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
});
