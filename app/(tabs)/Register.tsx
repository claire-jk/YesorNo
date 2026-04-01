import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView, ScrollView,
    StyleSheet, Text,
    TextInput, TouchableOpacity,
    useColorScheme,
    View
} from 'react-native';
import { auth } from './firebaseConfig';

interface RegisterProps {
  onNavigate: () => void;
}

export default function Register({ onNavigate }: RegisterProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // 自定義提示訊息狀態
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'info' });

  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const Colors = {
    bg: isDarkMode ? '#121212' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    inputBg: isDarkMode ? '#1E1E1E' : '#F8F9FA',
    inputBorder: isDarkMode ? '#333333' : '#E0E0E0',
    primary: '#FF6F61',
    secondary: isDarkMode ? '#AAAAAA' : '#666666',
    modalBg: isDarkMode ? '#252525' : '#FFFFFF',
  };

  // 封裝美化版提示函式
  const showCustomAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModalConfig({ title, message, type });
    setModalVisible(true);
  };

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      showCustomAlert('提示', '請填寫完整資訊，欄位不可為空喔！', 'info');
      return;
    }
    if (password !== confirmPassword) {
      showCustomAlert('錯誤', '兩次輸入的密碼不一致，請重新檢查', 'error');
      return;
    }
    if (password.length < 6) {
      showCustomAlert('提醒', '為了您的帳號安全，密碼長度需至少 6 位數', 'info');
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      showCustomAlert('成功', '您的帳號已建立！現在就去登入開啟購物之旅吧！', 'success');
    } catch (error: any) {
      let errorMessage = '註冊過程出了點問題，請稍後再試';
      if (error.code === 'auth/email-already-in-use') errorMessage = '此電子郵件已被註冊過囉';
      if (error.code === 'auth/invalid-email') errorMessage = '電子郵件格式似乎不正確';
      showCustomAlert('註冊失敗', errorMessage, 'error');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.bg }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 返回按鈕 */}
          <TouchableOpacity style={styles.backButton} onPress={onNavigate}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={[styles.title, { color: Colors.text }]}>加入購了沒</Text>
            <Text style={[styles.subtitle, { color: Colors.secondary }]}>開啟您的智慧購物之旅</Text>
          </View>

          <View style={styles.inputContainer}>
            {/* 電子郵件 */}
            <View style={[styles.inputWrapper, { backgroundColor: Colors.inputBg, borderColor: Colors.inputBorder }]}>
              <Ionicons name="mail-outline" size={20} color={Colors.secondary} style={styles.inputIcon} />
              <TextInput 
                style={[styles.input, { color: Colors.text }]} 
                placeholder="電子郵件" 
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            {/* 密碼 */}
            <View style={[styles.inputWrapper, { backgroundColor: Colors.inputBg, borderColor: Colors.inputBorder }]}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.secondary} style={styles.inputIcon} />
              <TextInput 
                style={[styles.input, { color: Colors.text }]} 
                placeholder="設定密碼 (至少6位)" 
                placeholderTextColor="#999"
                secureTextEntry={!showPwd}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPwd(!showPwd)}>
                <Ionicons name={showPwd ? "eye-outline" : "eye-off-outline"} size={22} color={Colors.secondary} />
              </TouchableOpacity>
            </View>

            {/* 確認密碼 */}
            <View style={[styles.inputWrapper, { backgroundColor: Colors.inputBg, borderColor: Colors.inputBorder }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.secondary} style={styles.inputIcon} />
              <TextInput 
                style={[styles.input, { color: Colors.text }]} 
                placeholder="確認新密碼" 
                placeholderTextColor="#999"
                secureTextEntry={!showConfirmPwd}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPwd(!showConfirmPwd)}>
                <Ionicons name={showConfirmPwd ? "eye-outline" : "eye-off-outline"} size={22} color={Colors.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
            <Text style={styles.buttonText}>註冊帳號</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.footerLink} onPress={onNavigate}>
            <Text style={[styles.footerText, { color: Colors.secondary }]}>
              已經有帳號？ <Text style={{ color: Colors.primary, fontWeight: 'bold' }}>點此登入</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 自定義美化版 Modal 提示框 */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalView, { backgroundColor: Colors.modalBg }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: modalConfig.type === 'error' ? '#FFEDED' : modalConfig.type === 'success' ? '#EEF9F1' : '#F0F4FF' }]}>
              <Ionicons 
                name={modalConfig.type === 'success' ? 'checkmark-circle' : modalConfig.type === 'error' ? 'close-circle' : 'information-circle'} 
                size={40} 
                color={modalConfig.type === 'success' ? '#4CAF50' : modalConfig.type === 'error' ? '#F44336' : Colors.primary} 
              />
            </View>
            <Text style={[styles.modalTitle, { color: Colors.text }]}>{modalConfig.title}</Text>
            <Text style={[styles.modalMessage, { color: Colors.secondary }]}>{modalConfig.message}</Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: Colors.primary }]}
              onPress={() => {
                setModalVisible(false);
                // 如果註冊成功，關閉彈窗後跳轉
                if (modalConfig.type === 'success') onNavigate();
              }}
            >
              <Text style={styles.modalButtonText}>
                {modalConfig.type === 'success' ? '登入去' : '我知道了'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { 
    paddingHorizontal: 30, 
    paddingVertical: 60, 
    flexGrow: 1, 
    justifyContent: 'center' 
  },
  backButton: { 
    position: 'absolute', 
    top: 20, 
    left: 20,
    zIndex: 10 
  },
  header: { marginBottom: 40, marginTop: 20 },
  title: { fontSize: 32, fontFamily: 'ZenKurenaido' },
  subtitle: { fontSize: 16, fontFamily: 'ZenKurenaido', marginTop: 10 },
  inputContainer: { marginBottom: 20 },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderRadius: 15, 
    paddingHorizontal: 15, 
    marginBottom: 15,
    height: 60 
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: 'ZenKurenaido', fontSize: 18 },
  registerButton: {
    backgroundColor: '#FF6F61',
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 10,
    elevation: 3,
    shadowColor: '#FF6F61',
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  buttonText: { color: '#fff', fontSize: 18, fontFamily: 'ZenKurenaido' },
  footerLink: { marginTop: 25, alignItems: 'center' },
  footerText: { fontFamily: 'ZenKurenaido', fontSize: 16 },

  /* --- Modal 提示框樣式 --- */
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalView: { 
    width: '80%', 
    borderRadius: 30, // 超圓潤圓角
    padding: 25, 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.25, 
    shadowRadius: 4, 
    elevation: 5 
  },
  modalIconCircle: { 
    width: 70, 
    height: 70, 
    borderRadius: 35, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 15 
  },
  modalTitle: { 
    fontSize: 24, 
    fontFamily: 'ZenKurenaido', 
    marginBottom: 10 
  },
  modalMessage: { 
    fontSize: 16, 
    fontFamily: 'ZenKurenaido', 
    textAlign: 'center', 
    marginBottom: 25, 
    lineHeight: 22 
  },
  modalButton: { 
    width: '100%', 
    paddingVertical: 12, 
    borderRadius: 20, 
    alignItems: 'center' 
  },
  modalButtonText: { 
    color: 'white', 
    fontSize: 18, 
    fontFamily: 'ZenKurenaido'
  }
});