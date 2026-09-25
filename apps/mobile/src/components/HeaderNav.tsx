import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage, LANGUAGES, Language } from '../i18n/LanguageContext';
import { useAuth } from '../auth/useAuth';

export function HeaderNav() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { isAuthenticated, isAdmin, isMod, hasVdeAccess } = useAuth();

  const [menuVisible, setMenuVisible] = useState(false);
  const [adminVisible, setAdminVisible] = useState(false);
  const [langPickerVisible, setLangPickerVisible] = useState(false);

  const navigateTo = (path: string) => {
    setMenuVisible(false);
    setAdminVisible(false);
    router.push(path as any);
  };

  // Main Field Viewer Menu items
  const menuItems = [
    { key: 'tasks', label: t('tasks', 'AUFGABEN'), route: '/projects', icon: '📌' },
    { key: 'plans', label: t('plans', 'PLÄNE'), route: '/plans', icon: '📐' },
    { key: 'cables', label: t('cables', 'KABEL'), route: '/cables', icon: '🔌' },
    { key: 'circuits', label: t('circuits', 'STROMKREISE'), route: '/circuits', icon: '⚡' },
    { key: 'bma_automatik', label: t('bma_automatik', 'BMA AUTOMATIK'), route: '/bma', icon: '🚨' },
    { key: 'maengelanzeige', label: t('maengelanzeige', 'MÄNGELANZEIGE'), route: '/maengelanzeige', icon: '📝' },
    ...(hasVdeAccess || isAdmin
      ? [{ key: 'echeck', label: t('echeck', 'E-CHECK (VDE)'), route: '/echeck', icon: '⚡' }]
      : []),
    ...(isAdmin
      ? [
          { key: 'chargers', label: t('chargers', 'LADEGERÄT-INSTALLATION'), route: '/circuits', icon: '🔋' },
          { key: 'cable_auto', label: t('cable_auto', 'KABEL-AUTOMATISIERUNG'), route: '/cables', icon: '🔄' },
          { key: 'pdf_tool', label: t('pdf_tool', 'NARZĘDZIE PDF'), route: '/plans', icon: '📄' },
          { key: 'aufmass', label: t('aufmass', 'AUFMASS'), route: '/plans', icon: '📏' },
        ]
      : []),
    { key: 'materials_orders', label: t('materials_orders', 'ANFORDERUNGEN'), route: '/orders', icon: '📦' },
    { key: 'questions', label: t('questions', 'FRAGEN'), route: '/tasks/create', icon: '❓' },
    ...(isMod || isAdmin
      ? [{ key: 'employees', label: t('employees', 'MITARBEITER / ZEITERFASSUNG'), route: '/attendance', icon: '👥' }]
      : []),
  ];

  // Admin Menu items (Only for Admin roles)
  const adminItems = [
    { key: 'yolo_annotator', label: '⚡ YOLO ANNOTATOR', route: '/plans' },
    { key: 'symbol_detection', label: '🔍 SYMBOL DETECTION', route: '/plans' },
    { key: 'photo_doc', label: '📸 FOTO-DOKUMENTATION', route: '/projects' },
    { key: 'maengelanzeige', label: '📝 MÄNGELANZEIGE', route: '/maengelanzeige' },
    { key: 'project_progress', label: '📊 PROJEKTFORTSCHRITT', route: '/projects' },
    { key: 'users', label: '👤 BENUTZER', route: '/attendance' },
    { key: 'companies', label: '🏢 UNTERNEHMEN', route: '/projects' },
    { key: 'reports', label: '📑 BERICHTE (PDF)', route: '/plans' },
    { key: 'user_reports', label: '📋 BENUTZERBERICHTE', route: '/attendance' },
    { key: 'to_approve', label: '✅ ZUR GENEHMIGUNG', route: '/projects' },
    { key: 'completed_work', label: '🏆 FERTIGE ARBEITEN', route: '/projects' },
    { key: 'materials_admin', label: '📦 MATERIALIEN (ADMIN)', route: '/orders' },
    { key: 'attendance_list', label: '⏱️ ANWESENHEITSLISTE', route: '/attendance' },
    { key: 'revisions', label: '🔄 REVISIONEN', route: '/plans' },
    { key: 'errors', label: '⚠️ FEHLER', route: '/tasks/create' },
    { key: 'upload_plan', label: '⬆️ PLAN HOCHLADEN', route: '/plans' },
  ];


  const currentFlag = LANGUAGES.find((l) => l.code === language)?.flag || '🇩🇪';

  return (
    <View style={styles.topBar}>
      {/* Brand */}
      <TouchableOpacity
        style={styles.brand}
        onPress={() => router.push('/')}
        activeOpacity={0.8}
      >
        <Text style={styles.brandLightning}>⚡</Text>
        <Text style={styles.brandName}>et4u</Text>
      </TouchableOpacity>

      {/* Navigation Buttons */}
      <View style={styles.navRow}>
        {/* MENU ▾ */}
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.menuBtnText}>{t('menu', 'MENU ▾')}</Text>
        </TouchableOpacity>

        {/* ADMIN ▾ (Only visible if authenticated and role is ADMIN/MOD) */}
        {isAuthenticated && isAdmin && (
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => setAdminVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.adminBtnText}>{t('admin', 'ADMIN ▾')}</Text>
          </TouchableOpacity>
        )}

        {/* Language Switcher */}
        <TouchableOpacity
          style={styles.langBtn}
          onPress={() => setLangPickerVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.langBtnText}>{currentFlag} {language.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: MENU (Viewer) */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.dropdownModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ MENU (et4u)</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
              {menuItems.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.menuItem}
                  onPress={() => navigateTo(item.route)}
                >
                  <Text style={styles.itemIcon}>{item.icon}</Text>
                  <Text style={styles.itemText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Modal: ADMIN (Protected) */}
      {isAuthenticated && isAdmin && (
        <Modal
          visible={adminVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAdminVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setAdminVisible(false)}>
            <View style={[styles.dropdownModal, styles.adminDropdownModal]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: '#EAB308' }]}>👑 ADMIN PANEL</Text>
                <TouchableOpacity onPress={() => setAdminVisible(false)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
                {adminItems.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.menuItem}
                    onPress={() => navigateTo(item.route)}
                  >
                    <Text style={styles.itemText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Modal: 4 Languages Switcher */}
      <Modal
        visible={langPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLangPickerVisible(false)}>
          <View style={styles.langModal}>
            <Text style={styles.modalTitle}>🌍 Wybierz język / Sprache</Text>
            <View style={styles.langGrid}>
              {LANGUAGES.map((l) => (
                <TouchableOpacity
                  key={l.code}
                  style={[styles.langChoice, language === l.code && styles.langChoiceActive]}
                  onPress={() => {
                    setLanguage(l.code as Language);
                    setLangPickerVisible(false);
                  }}
                >
                  <Text style={styles.langFlag}>{l.flag}</Text>
                  <Text style={[styles.langLabel, language === l.code && styles.langLabelActive]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B0F19',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLightning: {
    fontSize: 18,
    marginRight: 4,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  menuBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  adminBtn: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  adminBtnText: {
    color: '#EAB308',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  langBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdownModal: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#38BDF8',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  adminDropdownModal: {
    borderColor: '#EAB308',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  closeBtn: {
    fontSize: 18,
    color: '#94A3B8',
    paddingHorizontal: 6,
  },
  scrollList: {
    maxHeight: 480,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  itemIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  itemText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  langModal: {
    width: '90%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  langGrid: {
    marginTop: 16,
    gap: 10,
  },
  langChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langChoiceActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  langFlag: {
    fontSize: 22,
    marginRight: 12,
  },
  langLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94A3B8',
  },
  langLabelActive: {
    color: '#38BDF8',
  },
});
