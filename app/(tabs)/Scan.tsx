import { ZenKurenaido_400Regular, useFonts } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
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

// --- 網路設定：已更新為 Render 雲端網址 ---
const PYTHON_BACKEND_URL = "https://pybackend-i3qu.onrender.com/auto_compare";

interface Product {
  id: string;
  name: string;
  stock?: number;
  userId?: string;
  familyId?: string;
  image?: string;
}

interface ScanResult {
  status: 'owned' | 'not_found' | 'error';
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

  const [mode, setMode] = useState<'personal' | 'family'>('personal');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<any>(null);

  const Colors = {
    bg: isDarkMode ? '#000000' : '#F8FAFC',
    card: isDarkMode ? '#1C1C23' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#1A1A1A',
    subText: isDarkMode ? '#94A3B8' : '#64748B',
    primary: '#8B5CF6',
  };

  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isScanning]);

  // --- 核心辨識邏輯 ---
  const performAIScan = async () => {
    if (!cameraRef.current || isScanning) return;
    setIsScanning(true);
    setResult(null);

    try {
      // 1. 拍照並壓縮，減少上傳流量（雲端部署必備優化）
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      const manipResult = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 600 } }], 
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      const userId = auth.currentUser?.uid;
      if (!userId) {
        Alert.alert("請先登入", "辨識功能需要用戶身分");
        return;
      }

      // 2. 準備 FormData
      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri: manipResult.uri,
        name: 'scan.jpg',
        type: 'image/jpeg',
      });

      // 3. 發送至雲端後端
      const response = await fetch(`${PYTHON_BACKEND_URL}?user_id=${userId}&mode=${mode}`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        throw new Error(`伺服器回應錯誤: ${response.status}`);
      }

      const resData = await response.json();
      console.log("後端回傳結果:", resData);

      if (resData.status === 'success') {
        const item = resData.data;
        setResult({
          status: 'owned',
          name: item.name,
          stock: item.stock,
          isSufficient: item.stock > 1,
          score: item.score
        });
      } else {
        // 如果找不到匹配，給予一個「最像」的猜測名稱
        setResult({ 
          status: 'not_found', 
          name: resData.best_guess || '未知物品' 
        });
        setNewItemName(resData.best_guess !== "未知" ? resData.best_guess : "");
      }

    } catch (error) {
      console.error(error);
      Alert.alert("連線失敗", "無法連線至雲端伺服器，請檢查網路或等待伺服器喚醒");
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
        userId: userId,
        type: 'owned',
        stock: 1,
        createdAt: new Date(),
        image: "" 
      });
      setShowAddModal(false);
      setResult({ status: 'owned', name: newItemName, stock: 1, isSufficient: false });
    } catch (e) { console.error(e); }
  };

  if (!fontsLoaded || !permission) return null;
  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.bg }]}>
        <Text style={[styles.zenText, { color: Colors.text }]}>需要相機權限才能掃描</Text>
        <TouchableOpacity onPress={requestPermission} style={[styles.btn, { backgroundColor: Colors.primary }]}>
          <Text style={[styles.zenText, { color: '#FFF' }]}>開啟權限</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} ref={cameraRef}>
        
        {isScanning && (
          <Animated.View style={[styles.scanOverlay, { opacity: pulseAnim }]}>
            <View style={styles.scanTargetBox} />
            <Text style={[styles.zenText, styles.scanningLabel]}>AI 特徵提取與庫存比對中...</Text>
          </Animated.View>
        )}

        <View style={[styles.topUI, { paddingTop: insets.top + 10 }]}>
          <View style={styles.tabBar}>
            {(['personal', 'family'] as const).map((m) => (
              <TouchableOpacity 
                key={m} 
                onPress={() => setMode(m)} 
                style={[styles.tab, mode === m && { backgroundColor: Colors.primary }]}
              >
                <Text style={[styles.tabText, { color: mode === m ? '#FFF' : '#CCC' }]}>
                  {m === 'personal' ? '個人庫存' : '家庭庫存'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {result && (
          <View style={[styles.resultTag, { backgroundColor: Colors.card }]}>
            <View style={styles.tagHeader}>
              <Ionicons 
                name={(result.status === 'owned' ? 'checkmark-circle' : 'help-circle') as any} 
                size={26} 
                color={result.status === 'owned' ? "#10B981" : Colors.primary} 
              />
              <Text style={[styles.tagName, { color: Colors.text }]}>{result.name}</Text>
            </View>
            
            {result.status === 'owned' ? (
              <Text style={[styles.tagDetail, styles.zenText, { color: Colors.subText }]}>
                {`AI 辨識成功 (${(result.score! * 100).toFixed(1)}%)\n庫存：${result.stock} | 狀態：${result.isSufficient ? '充足' : '偏低'}`}
              </Text>
            ) : (
              <View>
                <Text style={[styles.tagDetail, styles.zenText, { color: '#EF4444' }]}>
                  庫存中沒有相似的物品紀錄
                </Text>
                <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>新增此物品</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={() => setResult(null)} style={styles.closeTag}>
              <Ionicons name="close-circle" size={24} color={Colors.subText} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomUI}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="barcode-outline" size={28} color="#FFF" />
            <Text style={styles.iconLabel}>條碼</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={performAIScan} disabled={isScanning} style={styles.scanMainBtn}>
            {isScanning ? <ActivityIndicator color="#FFF" /> : <Ionicons name="scan-circle" size={60} color="#FFF" />}
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="search-outline" size={28} color="#FFF" />
            <Text style={styles.iconLabel}>手動</Text>
          </TouchableOpacity>
        </View>
      </CameraView>

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.card }]}>
            <Text style={[styles.modalTitle, { color: Colors.text }]}>找不到紀錄？</Text>
            <TextInput 
              style={[styles.input, styles.zenText, { color: Colors.text, borderColor: Colors.primary }]}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder="輸入新物品名稱"
              placeholderTextColor={Colors.subText}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.cancelBtn}>
                <Text style={[styles.zenText, { color: Colors.subText }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddToDB} style={[styles.confirmBtn, { backgroundColor: Colors.primary }]}>
                <Text style={[styles.zenText, { color: '#FFF' }]}>加入庫存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  zenText: { fontFamily: 'ZenKurenaido' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btn: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  topUI: { position: 'absolute', top: 0, width: '100%', alignItems: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 25, padding: 5 },
  tab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  tabText: { fontFamily: 'ZenKurenaido',  fontSize: 13 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(139, 92, 246, 0.2)' },
  scanTargetBox: { width: SCREEN_WIDTH * 0.7, height: SCREEN_WIDTH * 0.7, borderWidth: 2, borderColor: '#A78BFA', borderRadius: 40, borderStyle: 'dashed' },
  scanningLabel: { color: '#FFF', marginTop: 30, fontSize: 16 },
  resultTag: { 
    position: 'absolute', top: 160, alignSelf: 'center', width: '88%', padding: 25, borderRadius: 30, 
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 
  },
  tagHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tagName: { fontFamily: 'ZenKurenaido', fontSize: 22,marginLeft: 10 },
  tagDetail: { fontSize: 15, marginLeft: 36, lineHeight: 22 },
  closeTag: { position: 'absolute', top: 15, right: 15 },
  addBtn: { backgroundColor: '#8B5CF6', marginLeft: 36, marginTop: 15, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 },
  addBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'ZenKurenaido' },
  bottomUI: { position: 'absolute', bottom: 50, flexDirection: 'row', width: '100%', justifyContent: 'space-around', alignItems: 'center' },
  scanMainBtn: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center', borderWidth: 5, borderColor: 'rgba(255,255,255,0.3)' },
  iconBtn: { alignItems: 'center' },
  iconLabel: { color: '#FFF', fontFamily: 'ZenKurenaido', fontSize: 11, marginTop: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', padding: 30, borderRadius: 30 },
  modalTitle: { fontSize: 24,  fontFamily: 'ZenKurenaido', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1.5, borderRadius: 15, padding: 15, marginBottom: 25 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { padding: 10, flex: 1, alignItems: 'center' },
  confirmBtn: { padding: 10, flex: 1, alignItems: 'center', borderRadius: 15 },
});