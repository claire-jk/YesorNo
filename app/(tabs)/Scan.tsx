import { ZenKurenaido_400Regular, useFonts } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { addDoc, collection } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from './firebaseConfig';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PYTHON_BACKEND_URL = "https://pybackend-i3qu.onrender.com/auto_compare";

interface ScanResult {
  status: 'owned' | 'not_found';
  name: string;
  stock?: number;
  isSufficient?: boolean;
  score?: number;
}

export default function ScanScreen() {
  const [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const tabBarHeight = useBottomTabBarHeight();

  const [mode, setMode] = useState<'personal' | 'family'>('personal');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<any>(null);

  const Colors = {
    primary: '#7C69EF',
    success: '#10B981',
    text: isDarkMode ? '#FFFFFF' : '#0F172A',
    subText: isDarkMode ? '#A1A1AA' : '#64748B',
    cardBg: isDarkMode ? 'rgba(30, 30, 38, 0.95)' : 'rgba(255, 255, 255, 0.9)',
  };

  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
      scanLineAnim.setValue(0);
    }
  }, [isScanning]);

  const performAIScan = async () => {
    if (!cameraRef.current || isScanning) return;
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert("請先登入", "辨識功能需要驗證用戶身分");
      return;
    }

    setIsScanning(true);
    setResult(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      const manipResult = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 500 } }], 
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri: manipResult.uri,
        name: 'scan.jpg',
        type: 'image/jpeg',
      });

      // 偵錯用：確認發送的 UID 是否與截圖中的 "Fe4PEq98..." 一致
      console.log(`[Scan] 發送請求 - UID: ${currentUser.uid}, 模式: ${mode}`);

      const response = await fetch(`${PYTHON_BACKEND_URL}?user_id=${currentUser.uid}&mode=${mode}`, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`Server Status: ${response.status}`);

      const resData = await response.json();
      console.log("[Scan] 伺服器回傳結果:", resData);

      if (resData.status === 'success') {
        // 情況 1：後端在 Firestore 成功找到對應 userId 的產品
        setResult({
          status: 'owned',
          name: resData.data.name,
          stock: resData.data.stock || 1,
          isSufficient: (resData.data.stock || 1) > 1,
          score: resData.data.score
        });
      } else {
        // 情況 2：後端認得物品名稱 (best_guess)，但資料庫沒這筆資料
        setResult({ 
          status: 'not_found', 
          name: resData.best_guess || '未知物品' 
        });
        setNewItemName(resData.best_guess !== "未知" ? resData.best_guess : "");
      }
    } catch (error) {
      console.error("[Scan] 錯誤:", error);
      Alert.alert("辨識失敗", "請確認網路連線或稍後再試");
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddToDB = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    try {
      await addDoc(collection(db, 'products'), {
        name: newItemName,
        userId: userId, // 確保這裡的欄位名稱與截圖中的 userId 一致
        type: 'owned',
        stock: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: "" 
      });
      setShowAddModal(false);
      setResult({ status: 'owned', name: newItemName, stock: 1, isSufficient: false });
      Alert.alert("成功", "物品已加入庫存");
    } catch (e) { console.error(e); }
  };

  if (!fontsLoaded || !permission) return null;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.zenText}>需要相機權限</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionBtn}>
          <Text style={{ color: '#FFF', fontFamily: 'ZenKurenaido' }}>開啟權限</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_WIDTH * 0.7],
  });

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} ref={cameraRef}>
        
        {/* 掃描框區域 */}
        <View style={styles.overlayArea}>
          <Animated.View style={[styles.scanTargetBox, { opacity: pulseAnim, borderColor: Colors.primary }]}>
            <Animated.View style={[styles.scanLine, { backgroundColor: Colors.primary, transform: [{ translateY }] }]} />
          </Animated.View>
          {isScanning && <Text style={[styles.zenText, styles.scanningText]}>正在分析影像...</Text>}
        </View>

        {/* 頂部 Tab */}
        <View style={[styles.topUI, { paddingTop: insets.top + 10 }]}>
          <BlurView intensity={60} tint={isDarkMode ? "dark" : "light"} style={styles.tabBarContainer}>
            {(['personal', 'family'] as const).map((m) => (
              <TouchableOpacity 
                key={m} 
                onPress={() => { setMode(m); setResult(null); }} 
                style={[styles.tab, mode === m && { backgroundColor: Colors.primary }]}
              >
                <Text style={[styles.tabText, { color: mode === m ? '#FFF' : Colors.subText }]}>
                  {m === 'personal' ? '個人' : '家庭'}
                </Text>
              </TouchableOpacity>
            ))}
          </BlurView>
        </View>

        {/* 結果卡片 */}
        {result && (
          <View style={styles.resultTagWrapper}>
            <BlurView intensity={100} tint={isDarkMode ? "dark" : "light"} style={styles.resultTag}>
              <View style={styles.tagHeader}>
                <Ionicons 
                  name={result.status === 'owned' ? 'checkmark-circle' : 'add-circle'} 
                  size={38} 
                  color={result.status === 'owned' ? Colors.success : Colors.primary} 
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={[styles.tagName, { color: Colors.text }]}>{result.name}</Text>
                  <Text style={[styles.zenText, { color: result.status === 'owned' ? Colors.success : Colors.primary, fontSize: 14 }]}>
                    {result.status === 'owned' ? '● 已在您的清單中' : '○ 偵測到新物品'}
                  </Text>
                </View>
              </View>
              
              <View style={{ marginTop: 15, marginLeft: 50 }}>
                {result.status === 'owned' ? (
                  <Text style={[styles.tagDetail, styles.zenText, { color: Colors.subText }]}>
                    {`目前庫存量：${result.stock} 件\n辨識度：${((result.score || 0.9) * 100).toFixed(0)}%\n狀態：${result.isSufficient ? '充足' : '建議補充'}`}
                  </Text>
                ) : (
                  <View>
                    <Text style={[styles.zenText, { color: Colors.subText, fontSize: 14, marginBottom: 15 }]}>
                      系統辨識為「{result.name}」，但不在您的清單中。
                    </Text>
                    <TouchableOpacity 
                      onPress={() => setShowAddModal(true)} 
                      style={[styles.addBtn, { backgroundColor: Colors.primary }]}
                    >
                      <Text style={styles.addBtnText}>+ 加入庫存</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity onPress={() => setResult(null)} style={styles.closeTag}>
                <Ionicons name="close-circle" size={28} color="#94A3B8" />
              </TouchableOpacity>
            </BlurView>
          </View>
        )}

        {/* 底部按鈕 */}
        <View style={[styles.bottomUI, { bottom: tabBarHeight + 20 }]}>
          <TouchableOpacity style={styles.subActionBtn}>
            <View style={styles.iconCircle}><Ionicons name="barcode-outline" size={24} color="#FFF" /></View>
            <Text style={styles.subActionLabel}>條碼</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={performAIScan} disabled={isScanning} style={styles.mainScanBtn}>
            <View style={[styles.mainScanInner, { backgroundColor: Colors.primary }]}>
              {isScanning ? <ActivityIndicator color="#FFF" size="large" /> : <Ionicons name="scan-outline" size={42} color="#FFF" />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.subActionBtn}>
            <View style={styles.iconCircle}><Ionicons name="search-outline" size={24} color="#FFF" /></View>
            <Text style={styles.subActionLabel}>手動</Text>
          </TouchableOpacity>
        </View>

      </CameraView>

      {/* 新增 Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <BlurView intensity={50} tint="dark" style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDarkMode ? '#1C1C23' : '#FFF' }]}>
            <Text style={[styles.modalTitle, { color: Colors.text }]}>新增至清單</Text>
            <TextInput 
              style={[styles.input, styles.zenText, { color: Colors.text, borderColor: Colors.primary }]}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder="物品名稱"
              placeholderTextColor="#999"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.cancelBtn}>
                <Text style={[styles.zenText, { color: Colors.subText }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddToDB} style={[styles.confirmBtn, { backgroundColor: Colors.primary }]}>
                <Text style={[styles.zenText, { color: '#FFF' }]}>確認加入</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  zenText: { fontFamily: 'ZenKurenaido' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionBtn: { marginTop: 20, paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25, backgroundColor: '#7C69EF' },
  overlayArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanTargetBox: { width: SCREEN_WIDTH * 0.7, height: SCREEN_WIDTH * 0.7, borderWidth: 2, borderRadius: 45, overflow: 'hidden' },
  scanLine: { width: '100%', height: 4, shadowColor: '#FFF', shadowRadius: 10, shadowOpacity: 1, elevation: 10 },
  scanningText: { color: '#FFF', marginTop: 25, fontSize: 16, letterSpacing: 2 },
  topUI: { position: 'absolute', top: 0, width: '100%', alignItems: 'center' },
  tabBarContainer: { flexDirection: 'row', borderRadius: 30, padding: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  tab: { paddingHorizontal: 25, paddingVertical: 8, borderRadius: 25 },
  tabText: { fontFamily: 'ZenKurenaido', fontSize: 14 },
  resultTagWrapper: { position: 'absolute', top: 140, width: '100%', alignItems: 'center' },
  resultTag: { width: '92%', padding: 25, borderRadius: 35, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  tagHeader: { flexDirection: 'row', alignItems: 'center' },
  tagName: { fontFamily: 'ZenKurenaido', fontSize: 24, fontWeight: 'bold' },
  tagDetail: { fontSize: 15, lineHeight: 25 },
  closeTag: { position: 'absolute', top: 15, right: 15 },
  addBtn: { alignSelf: 'flex-start', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 15 },
  addBtnText: { color: '#FFF', fontFamily: 'ZenKurenaido', fontSize: 16, fontWeight: 'bold' },
  bottomUI: { position: 'absolute', flexDirection: 'row', width: '100%', justifyContent: 'space-evenly', alignItems: 'center', paddingHorizontal: 20 },
  mainScanBtn: { width: 95, height: 95, borderRadius: 48, backgroundColor: 'rgba(124, 105, 239, 0.2)', justifyContent: 'center', alignItems: 'center' },
  mainScanInner: { width: 75, height: 75, borderRadius: 38, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#7C69EF', shadowOpacity: 0.5, shadowRadius: 15 },
  subActionBtn: { alignItems: 'center' },
  iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  subActionLabel: { color: '#FFF', fontFamily: 'ZenKurenaido', fontSize: 12, marginTop: 6 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', padding: 30, borderRadius: 35 },
  modalTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', textAlign: 'center', marginBottom: 25, fontWeight: 'bold' },
  input: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 25, textAlign: 'center', fontSize: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  cancelBtn: { padding: 12 },
  confirmBtn: { paddingVertical: 14, paddingHorizontal: 35, borderRadius: 18 },
});