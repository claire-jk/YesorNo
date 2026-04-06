import { ZenKurenaido_400Regular, useFonts } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker'; // 新增相簿支援
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

// 更新為你最新的 API 端點路徑
const BASE_URL = "https://pybackend-i3qu.onrender.com";
const IMAGE_API = `${BASE_URL}/identify_by_image`;
const NAME_API = `${BASE_URL}/identify_by_name`;
const API_URL = "http:// 192.168.0.188:8000/identify_by_image";

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
  const [searchName, setSearchName] = useState(''); // 用於搜尋框

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

  // --- 核心邏輯：影像辨識處理 (相機與相簿通用) ---
  const processImageRecognition = async (uri: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert("請先登入");
      return;
    }
    console.log("--- [App Debug] 開始發送請求 ---");
  console.log("目標 URL:", `${IMAGE_API}?user_id=${currentUser.uid}&mode=${mode}`);

    setIsScanning(true);
    setResult(null);

    try {
      // 影像壓縮優化速度
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
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

      const response = await fetch(`${IMAGE_API}?user_id=${currentUser.uid}&mode=${mode}`, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' },
      });

      console.log("--- [App Debug] 伺服器回應狀態碼:", response.status);
  

      const resData = await response.json();
console.log("--- [App Debug] 伺服器回傳內容:", resData);

      if (resData.status === 'success') {
        setResult({
          status: 'owned',
          name: resData.data.name,
          stock: resData.data.stock || 0,
          isSufficient: (resData.data.stock || 0) > 1,
          score: resData.data.score
        });
      } else {
        setResult({ 
          status: 'not_found', 
          name: resData.best_guess || '未知物品' 
        });
        setSearchName(resData.best_guess !== "未知" ? resData.best_guess : "");
      }
    } catch (error) {
      console.error("[Scan] 影像辨識錯誤:", error);
      Alert.alert("辨識失敗", "請檢查網路連線");
    } finally {
      setIsScanning(false);
    }
  };

  // 1. 手機鏡頭辨識
  const performAIScan = async () => {
    if (!cameraRef.current || isScanning) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
    processImageRecognition(photo.uri);
  };

  // 2. 上傳相簿照片辨識
  const pickImageAndScan = async () => {
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });

    if (!pickerResult.canceled) {
      processImageRecognition(pickerResult.assets[0].uri);
    }
  };

  // 3. 輸入商品名稱辨識 (文字搜尋)
  const handleNameSearch = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !searchName.trim()) return;

    setIsScanning(true);
    setResult(null);

    try {
      const response = await fetch(
        `${NAME_API}?user_id=${currentUser.uid}&mode=${mode}&query_name=${encodeURIComponent(searchName)}`
      );
      const resData = await response.json();

      if (resData.status === 'success') {
        // 抓取搜尋結果的第一筆 (最接近的匹配)
        const item = resData.data[0];
        setResult({
          status: 'owned',
          name: item.name,
          stock: item.stock,
          isSufficient: item.stock > 1,
          score: 1.0 // 文字匹配設為 100%
        });
        setShowAddModal(false);
      } else {
        Alert.alert("找不到物品", "您的庫存中沒有名稱相符的商品，是否直接新增？");
      }
    } catch (error) {
      Alert.alert("搜尋失敗");
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddToDB = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    try {
      await addDoc(collection(db, 'products'), {
        name: searchName,
        userId: userId,
        type: 'owned',
        stock: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: "" 
      });
      setShowAddModal(false);
      setResult({ status: 'owned', name: searchName, stock: 1, isSufficient: false, score: 1.0 });
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
          {isScanning && <Text style={[styles.zenText, styles.scanningText]}>正在處理中...</Text>}
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
                      onPress={() => { setSearchName(result.name); setShowAddModal(true); }} 
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
          {/* 功能 2: 相簿上傳 */}
          <TouchableOpacity style={styles.subActionBtn} onPress={pickImageAndScan}>
            <View style={styles.iconCircle}><Ionicons name="image-outline" size={24} color="#FFF" /></View>
            <Text style={styles.subActionLabel}>相簿</Text>
          </TouchableOpacity>

          {/* 功能 1: 相機辨識 */}
          <TouchableOpacity onPress={performAIScan} disabled={isScanning} style={styles.mainScanBtn}>
            <View style={[styles.mainScanInner, { backgroundColor: Colors.primary }]}>
              {isScanning ? <ActivityIndicator color="#FFF" size="large" /> : <Ionicons name="scan-outline" size={42} color="#FFF" />}
            </View>
          </TouchableOpacity>

          {/* 功能 3: 手動名稱搜尋 */}
          <TouchableOpacity style={styles.subActionBtn} onPress={() => { setSearchName(''); setShowAddModal(true); }}>
            <View style={styles.iconCircle}><Ionicons name="search-outline" size={24} color="#FFF" /></View>
            <Text style={styles.subActionLabel}>搜尋</Text>
          </TouchableOpacity>
        </View>

      </CameraView>

      {/* 搜尋與新增 Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <BlurView intensity={50} tint="dark" style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDarkMode ? '#1C1C23' : '#FFF' }]}>
            <Text style={[styles.modalTitle, { color: Colors.text }]}>名稱辨識 / 新增</Text>
            <TextInput 
              style={[styles.input, styles.zenText, { color: Colors.text, borderColor: Colors.primary }]}
              value={searchName}
              onChangeText={setSearchName}
              placeholder="請輸入物品名稱..."
              placeholderTextColor="#999"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.cancelBtn}>
                <Text style={[styles.zenText, { color: Colors.subText }]}>取消</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={handleNameSearch} style={[styles.confirmBtn, { backgroundColor: '#4F46E5', marginRight: 5 }]}>
                <Text style={[styles.zenText, { color: '#FFF' }]}>搜尋</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleAddToDB} style={[styles.confirmBtn, { backgroundColor: Colors.primary }]}>
                <Text style={[styles.zenText, { color: '#FFF' }]}>新增</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}

// 樣式保持不變，僅針對新按鈕微調
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
  modalActions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  cancelBtn: { padding: 12, marginRight: 10 },
  confirmBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 18 },
});