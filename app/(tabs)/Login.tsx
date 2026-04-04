import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
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

interface LoginProps {
  onNavigate: () => void;
}

export default function Login({ onNavigate }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPassFocused, setIsPassFocused] = useState(false);
  
  // 自定義提示訊息狀態
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'info' });

  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // 按鈕縮放動畫 Shared Value
  const loginBtnScale = useSharedValue(1);

  const Colors = {
    bg: isDarkMode ? '#121212' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    inputBg: isDarkMode ? '#1E1E1E' : '#F8F9FA',
    inputBorder: isDarkMode ? '#333333' : '#E0E0E0',
    primary: '#FF6F61',
    secondary: isDarkMode ? '#AAAAAA' : '#666666',
    modalBg: isDarkMode ? '#252525' : '#FFFFFF',
  };

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: loginBtnScale.value }]
  }));

  const handlePressIn = () => (loginBtnScale.value = withSpring(0.95));
  const handlePressOut = () => (loginBtnScale.value = withSpring(1));

  // 封裝美化版提示
  const showCustomAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModalConfig({ title, message, type });
    setModalVisible(true);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showCustomAlert('提示', '請填寫電子郵件與密碼', 'info');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showCustomAlert('歡迎', '登入成功！快來選購吧', 'success');
    } catch (error: any) {
      showCustomAlert('登入失敗', '帳號或密碼錯誤，請再試一次', 'error');
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      showCustomAlert('提示', '請輸入電子郵件以重設密碼', 'info');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showCustomAlert('郵件已發送', '請檢查您的信箱以重設密碼', 'success');
    } catch (error: any) {
      showCustomAlert('錯誤', error.message, 'error');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.bg }]}>
      {/* 裝飾性背景圓球 */}
      <View style={[styles.bgCircle, { backgroundColor: Colors.primary, opacity: 0.05, top: -50, right: -50 }]} />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo 與標題動畫區 */}
          <Animated.View entering={FadeInDown.duration(800).springify()} style={styles.header}>
            <View style={styles.logoCircle}>
              <Ionicons name="cart" size={45} color="white" />
            </View>
            <Text style={[styles.title, { color: Colors.text }]}>購了沒？</Text>
            <Text style={[styles.subtitle, { color: Colors.secondary }]}>最懂你的購物小幫手</Text>
          </Animated.View>

          {/* 輸入框區塊動畫 */}
          <Animated.View entering={FadeInUp.delay(200).duration(800).springify()} style={styles.inputContainer}>
            <View style={[
              styles.inputWrapper, 
              { 
                backgroundColor: Colors.inputBg, 
                borderColor: isEmailFocused ? Colors.primary : Colors.inputBorder,
                borderWidth: isEmailFocused ? 2 : 1
              }
            ]}>
              <Ionicons name="mail-outline" size={20} color={isEmailFocused ? Colors.primary : Colors.secondary} style={styles.inputIcon} />
              <TextInput 
                style={[styles.input, { color: Colors.text }]} 
                placeholder="電子郵件" 
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={[
              styles.inputWrapper, 
              { 
                backgroundColor: Colors.inputBg, 
                borderColor: isPassFocused ? Colors.primary : Colors.inputBorder,
                borderWidth: isPassFocused ? 2 : 1
              }
            ]}>
              <Ionicons name="lock-closed-outline" size={20} color={isPassFocused ? Colors.primary : Colors.secondary} style={styles.inputIcon} />
              <TextInput 
                style={[styles.input, { color: Colors.text }]} 
                placeholder="密碼" 
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setIsPassFocused(true)}
                onBlur={() => setIsPassFocused(false)}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons 
                  name={showPassword ? "eye-outline" : "eye-off-outline"} 
                  size={22} 
                  color={Colors.secondary} 
                />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
              <Text style={[styles.forgotText, { color: Colors.primary }]}>忘記密碼？</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* 按鈕區塊動畫 */}
          <Animated.View entering={FadeInUp.delay(400).duration(800).springify()}>
            <TouchableOpacity 
              activeOpacity={0.9}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={handleLogin}
            >
              <Animated.View style={[styles.loginButton, animatedButtonStyle]}>
                <Text style={styles.buttonText}>立即登入</Text>
              </Animated.View>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: Colors.inputBorder }]} />
              <Text style={[styles.dividerText, { color: Colors.secondary }]}>快速登入</Text>
              <View style={[styles.line, { backgroundColor: Colors.inputBorder }]} />
            </View>

            <TouchableOpacity 
              style={styles.googleButton}
              onPress={() => showCustomAlert('公告', 'Google 登入開發中', 'info')}
            >
              <Ionicons name="logo-google" size={20} color="white" style={{ marginRight: 10 }} />
              <Text style={styles.buttonText}>Google 帳號</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.registerLink} onPress={onNavigate}>
              <Text style={[styles.registerText, { color: Colors.secondary }]}>
                還沒有帳號？ <Text style={{ color: Colors.primary, fontWeight: 'bold' }}>立即註冊</Text>
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
          <Animated.View 
            entering={FadeInUp} 
            style={[styles.modalView, { backgroundColor: Colors.modalBg }]}
          >
            <View style={[styles.modalIconCircle, { backgroundColor: modalConfig.type === 'error' ? '#FFEDED' : '#EEF9F1' }]}>
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
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>我知道了</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgCircle: { position: 'absolute', width: 250, height: 250, borderRadius: 125 },
  scrollContent: { paddingHorizontal: 30, paddingVertical: 50, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  logoCircle: { 
    backgroundColor: '#FF6F61', 
    padding: 15, 
    borderRadius: 25, 
    marginBottom: 15, 
    elevation: 10, 
    shadowColor: '#FF6F61', 
    shadowOpacity: 0.4, 
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 }
  },
  title: { fontSize: 36, fontFamily: 'ZenKurenaido', fontWeight: '600' },
  subtitle: { fontSize: 16, fontFamily: 'ZenKurenaido', marginTop: 5 },
  inputContainer: { width: '100%', marginBottom: 20 },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderRadius: 15, 
    paddingHorizontal: 15, 
    marginBottom: 15, 
    height: 60,
    // 微陰影
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: 'ZenKurenaido', fontSize: 18 },
  forgotBtn: { alignSelf: 'flex-end' },
  forgotText: { fontFamily: 'ZenKurenaido', fontSize: 14 },
  loginButton: { 
    backgroundColor: '#FF6F61', 
    padding: 18, 
    borderRadius: 15, 
    alignItems: 'center', 
    marginBottom: 20, 
    elevation: 5,
    shadowColor: '#FF6F61',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  googleButton: { backgroundColor: '#4285F4', padding: 15, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontFamily: 'ZenKurenaido' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
  line: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 15, fontFamily: 'ZenKurenaido', fontSize: 14 },
  registerLink: { marginTop: 25, alignItems: 'center' },
  registerText: { fontFamily: 'ZenKurenaido', fontSize: 16 },

  /* Modal 樣式 */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalView: { width: '80%', borderRadius: 30, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalIconCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 24, fontFamily: 'ZenKurenaido', marginBottom: 10 },
  modalMessage: { fontSize: 16, fontFamily: 'ZenKurenaido', textAlign: 'center', marginBottom: 25, lineHeight: 22 },
  modalButton: { width: '100%', paddingVertical: 12, borderRadius: 20, alignItems: 'center' },
  modalButtonText: { color: 'white', fontSize: 18, fontFamily: 'ZenKurenaido' }
});