import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView, ScrollView,
  StyleSheet, Text,
  TextInput, TouchableOpacity,
  useColorScheme,
  View
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { auth } from './firebaseConfig';

const { width } = Dimensions.get('window');

interface RegisterProps {
  onNavigate: () => void;
}

export default function Register({ onNavigate }: RegisterProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  
  // 焦點狀態
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 自定義提示訊息狀態
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'info' });

  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // 按鈕動畫 Shared Value
  const buttonScale = useSharedValue(1);

  const Colors = {
    bg: isDarkMode ? '#121212' : '#FDFDFD',
    text: isDarkMode ? '#FFFFFF' : '#2D3436',
    inputBg: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    inputBorder: isDarkMode ? '#333333' : '#F0F0F0',
    primary: '#FF6F61',
    secondary: isDarkMode ? '#AAAAAA' : '#636E72',
    modalBg: isDarkMode ? '#252525' : '#FFFFFF',
  };

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }]
  }));

  const handlePressIn = () => (buttonScale.value = withSpring(0.95));
  const handlePressOut = () => (buttonScale.value = withSpring(1));

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
      {/* 背景裝飾 */}
      <View style={[styles.bgCircle, { backgroundColor: Colors.primary, opacity: 0.05, bottom: -80, left: -80 }]} />
      
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
          <Animated.View entering={FadeInDown.duration(600)}>
            <TouchableOpacity style={styles.backButton} onPress={onNavigate}>
              <View style={[styles.backIconWrapper, { borderColor: Colors.inputBorder }]}>
                <Ionicons name="chevron-back" size={24} color={Colors.text} />
              </View>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(800).springify()} style={styles.header}>
            <Text style={[styles.title, { color: Colors.text }]}>加入購了沒</Text>
            <Text style={[styles.subtitle, { color: Colors.secondary }]}>最懂你的智慧購物管家 <Text style={{color: Colors.primary}}>●</Text></Text>
          </Animated.View>

          <View style={styles.inputContainer}>
            {/* 電子郵件 */}
            <Animated.View entering={FadeInUp.delay(400).duration(800)}>
              <View style={[
                styles.inputWrapper, 
                { 
                  backgroundColor: Colors.inputBg, 
                  borderColor: focusedField === 'email' ? Colors.primary : Colors.inputBorder,
                  borderWidth: focusedField === 'email' ? 1.5 : 1
                }
              ]}>
                <Ionicons name="mail-outline" size={20} color={focusedField === 'email' ? Colors.primary : Colors.secondary} style={styles.inputIcon} />
                <TextInput 
                  style={[styles.input, { color: Colors.text }]} 
                  placeholder="電子郵件" 
                  placeholderTextColor="#BDBDBD"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </Animated.View>

            {/* 密碼 */}
            <Animated.View entering={FadeInUp.delay(500).duration(800)}>
              <View style={[
                styles.inputWrapper, 
                { 
                  backgroundColor: Colors.inputBg, 
                  borderColor: focusedField === 'pwd' ? Colors.primary : Colors.inputBorder,
                  borderWidth: focusedField === 'pwd' ? 1.5 : 1
                }
              ]}>
                <Ionicons name="lock-closed-outline" size={20} color={focusedField === 'pwd' ? Colors.primary : Colors.secondary} style={styles.inputIcon} />
                <TextInput 
                  style={[styles.input, { color: Colors.text }]} 
                  placeholder="設定密碼 (至少6位)" 
                  placeholderTextColor="#BDBDBD"
                  secureTextEntry={!showPwd}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('pwd')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity onPress={() => setShowPwd(!showPwd)}>
                  <Ionicons name={showPwd ? "eye-outline" : "eye-off-outline"} size={22} color={Colors.secondary} />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* 確認密碼 */}
            <Animated.View entering={FadeInUp.delay(600).duration(800)}>
              <View style={[
                styles.inputWrapper, 
                { 
                  backgroundColor: Colors.inputBg, 
                  borderColor: focusedField === 'confirm' ? Colors.primary : Colors.inputBorder,
                  borderWidth: focusedField === 'confirm' ? 1.5 : 1
                }
              ]}>
                <Ionicons name="checkmark-circle-outline" size={20} color={focusedField === 'confirm' ? Colors.primary : Colors.secondary} style={styles.inputIcon} />
                <TextInput 
                  style={[styles.input, { color: Colors.text }]} 
                  placeholder="確認新密碼" 
                  placeholderTextColor="#BDBDBD"
                  secureTextEntry={!showConfirmPwd}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity onPress={() => setShowConfirmPwd(!showConfirmPwd)}>
                  <Ionicons name={showConfirmPwd ? "eye-outline" : "eye-off-outline"} size={22} color={Colors.secondary} />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>

          {/* 註冊按鈕 */}
          <Animated.View entering={FadeInUp.delay(800).duration(800)}>
            <TouchableOpacity 
              activeOpacity={0.9}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={handleRegister}
            >
              <Animated.View style={[styles.registerButton, animatedButtonStyle]}>
                <Text style={styles.buttonText}>註冊帳號</Text>
                <Ionicons name="arrow-forward" size={20} color="white" style={{marginLeft: 8}} />
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(1000).duration(800)} style={styles.footerLink}>
            <TouchableOpacity onPress={onNavigate}>
              <Text style={[styles.footerText, { color: Colors.secondary }]}>
                已經有帳號？ <Text style={{ color: Colors.primary, fontWeight: 'bold' }}>點此登入</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
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
          <Animated.View entering={FadeInUp} style={[styles.modalView, { backgroundColor: Colors.modalBg }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: modalConfig.type === 'error' ? '#FFEDED' : modalConfig.type === 'success' ? '#EEF9F1' : '#F0F4FF' }]}>
              <Ionicons 
                name={modalConfig.type === 'success' ? 'checkmark-circle' : modalConfig.type === 'error' ? 'close-circle' : 'information-circle'} 
                size={44} 
                color={modalConfig.type === 'success' ? '#4CAF50' : modalConfig.type === 'error' ? '#F44336' : Colors.primary} 
              />
            </View>
            <Text style={[styles.modalTitle, { color: Colors.text }]}>{modalConfig.title}</Text>
            <Text style={[styles.modalMessage, { color: Colors.secondary }]}>{modalConfig.message}</Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: Colors.primary }]}
              onPress={() => {
                setModalVisible(false);
                if (modalConfig.type === 'success') onNavigate();
              }}
            >
              <Text style={styles.modalButtonText}>
                {modalConfig.type === 'success' ? '登入去' : '我知道了'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  bgCircle: { position: 'absolute', width: 250, height: 250, borderRadius: 125 },
  scrollContent: { 
    paddingHorizontal: 30, 
    paddingVertical: 40, 
    flexGrow: 1, 
    justifyContent: 'center' 
  },
  backButton: { 
    marginBottom: 20,
    alignSelf: 'flex-start'
  },
  backIconWrapper: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  header: { marginBottom: 40 },
  title: { fontSize: 36, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
  subtitle: { fontSize: 16, fontFamily: 'ZenKurenaido', marginTop: 10, letterSpacing: 0.5 },
  inputContainer: { marginBottom: 20 },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderRadius: 18, 
    paddingHorizontal: 15, 
    marginBottom: 15,
    height: 62,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontFamily: 'ZenKurenaido', fontSize: 17, fontWeight: '500' },
  registerButton: {
    backgroundColor: '#FF6F61',
    padding: 18,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    elevation: 8,
    shadowColor: '#FF6F61',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 18, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
  footerLink: { marginTop: 30, alignItems: 'center' },
  footerText: { fontFamily: 'ZenKurenaido', fontSize: 16 },

  /* --- Modal 提示框樣式 --- */
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalView: { 
    width: '85%', 
    borderRadius: 35, 
    padding: 30, 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 20, 
    elevation: 10 
  },
  modalIconCircle: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  modalTitle: { 
    fontSize: 24, 
    fontFamily: 'ZenKurenaido', 
    fontWeight: 'bold',
    marginBottom: 12 
  },
  modalMessage: { 
    fontSize: 16, 
    fontFamily: 'ZenKurenaido', 
    textAlign: 'center', 
    marginBottom: 30, 
    lineHeight: 24 
  },
  modalButton: { 
    width: '100%', 
    paddingVertical: 14, 
    borderRadius: 18, 
    alignItems: 'center' 
  },
  modalButtonText: { 
    color: 'white', 
    fontSize: 18, 
    fontFamily: 'ZenKurenaido',
    fontWeight: 'bold'
  }
});