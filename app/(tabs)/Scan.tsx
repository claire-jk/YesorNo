import { ZenKurenaido_400Regular, useFonts } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
// 重要：請務必在此填入有效的 Google Cloud Vision API Key
const GOOGLE_CLOUD_VISION_API_KEY = 'YOUR_API_KEY';

// 1. 定義資料庫產品介面
interface Product {
  id?: string;
  name: string;
  stock?: number;
  userId?: string;
  familyId?: string;
}

// 2. 定義辨識結果介面 (解決 .name 與 .status 報錯)
interface ScanResult {
  status: 'owned' | 'not_found' | 'error';
  name: string;
  stock?: number;
  isSufficient?: boolean;
  message?: string;
}

export default function ScanScreen() {
  const [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';

  // 狀態管理
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

  // --- 核心功能：影像辨識與比對 ---
  const performAIScan = async () => {
    if (!cameraRef.current || isScanning) return;
    setIsScanning(true);
    setResult(null);

    try {
      // 1. 拍照並進行適度壓縮與縮放（提高辨識率）
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      const manipResult = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 800 } }], // 增加寬度以利於抓取文字與細節
        { base64: true }
      );

      // 2. 呼叫 Vision API 的 WEB_DETECTION (視覺比對的核心)
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: manipResult.base64 },
              features: [
                { type: 'WEB_DETECTION', maxResults: 10 },
                { type: 'LOGO_DETECTION', maxResults: 5 }
              ]
            }]
          })
        }
      );

      const data = await response.json();
      const visionResult = data.responses[0];
      
      // 提取視覺實體（例如產品名稱、品牌）
      const webEntities = visionResult.webDetection?.webEntities || [];
      const logos = visionResult.logoAnnotations?.map((l: any) => l.description) || [];
      const bestGuess = visionResult.webDetection?.bestGuessLabels?.[0]?.label || "";

      // 整合所有視覺特徵進行比對
      const visualFeatures = [
        ...webEntities.map((e: any) => e.description),
        ...logos,
        bestGuess
      ].filter(Boolean);
      
      if (visualFeatures.length > 0) {
        await checkImageMatch(visualFeatures);
      } else {
        setResult({ status: 'error', name: '無法辨識', message: '請對準物品並確保光線充足' });
      }
    } catch (error) {
      setResult({ status: 'error', name: '系統錯誤', message: '辨識服務暫時不可用' });
    } finally {
      setIsScanning(false);
    }
  };

  const checkImageMatch = async (visualFeatures: string[]) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    let targetId = userId;
    let idField = 'userId';

    if (mode === 'family') {
      const familyQ = query(collection(db, 'family_members'), where('userId', '==', userId));
      const snap = await getDocs(familyQ);
      if (!snap.empty) {
        targetId = snap.docs[0].data().familyId;
        idField = 'familyId';
      }
    }

    // 抓取該使用者/家庭的所有庫存清單
    const q = query(collection(db, 'products'), where(idField, '==', targetId));
    const querySnapshot = await getDocs(q);
    
    let bestMatch: { item: Product, score: number } | null = null;

    // 影像權重比對算法
    for (const doc of querySnapshot.docs) {
      const data = doc.data() as Product;
      const dbName = data.name.toLowerCase().trim();
      
      let score = 0;
      visualFeatures.forEach((feature, index) => {
        const feat = feature.toLowerCase();
        // 1. 完全符合（極高分）
        if (feat === dbName) score += 15;
        // 2. 包含關係（分數隨排名遞減）
        else if (feat.includes(dbName) || dbName.includes(feat)) score += (8 - index * 0.5);
      });

      if (score > 3 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { item: { ...data, id: doc.id }, score };
      }
    }

    if (bestMatch) {
      setResult({
        status: 'owned',
        name: bestMatch.item.name,
        stock: bestMatch.item.stock || 0,
        isSufficient: (bestMatch.item.stock || 0) > 1
      });
    } else {
      // 拿 AI 覺得最可能的視覺名稱作為建議名稱
      const suggestedName = visualFeatures[0] || '未知物品';
      setResult({ status: 'not_found', name: suggestedName });
      setNewItemName(suggestedName);
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
        createdAt: new Date()
      });
      setShowAddModal(false);
      setResult({ status: 'owned', name: newItemName, stock: 1, isSufficient: false });
    } catch (e) { console.error(e); }
  };

  if (!fontsLoaded || !permission) return null;
  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.bg }]}>
        <Text style={[styles.zenText, { color: Colors.text }]}>請授權相機權限</Text>
        <TouchableOpacity onPress={requestPermission} style={[styles.btn, { backgroundColor: Colors.primary }]}>
          <Text style={[styles.zenText, { color: '#FFF' }]}>開啟相機</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} ref={cameraRef}>
        
        {/* AR 掃描導引介面 */}
        {isScanning && (
          <Animated.View style={[styles.scanOverlay, { opacity: pulseAnim }]}>
            <View style={styles.scanTargetBox} />
            <Text style={[styles.zenText, styles.scanningLabel]}>AI 影像特徵分析中...</Text>
          </Animated.View>
        )}

        {/* 模式切換 */}
        <View style={[styles.topUI, { paddingTop: insets.top + 10 }]}>
          <View style={styles.tabBar}>
            {(['personal', 'family'] as const).map((m) => (
              <TouchableOpacity 
                key={m} 
                onPress={() => setMode(m)} 
                style={[styles.tab, mode === m && { backgroundColor: Colors.primary }]}
              >
                <Text style={[styles.tabText, { color: mode === m ? '#FFF' : '#CCC' }]}>
                  {m === 'personal' ? '個人庫存比對' : '家庭庫存比對'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 辨識結果顯示區 */}
        {result && (
          <View style={[styles.resultTag, { backgroundColor: Colors.card }]}>
            <View style={styles.tagHeader}>
              <Ionicons 
                name={(result.status === 'owned' ? 'checkmark-shield-outline' : 'help-circle-outline') as any} 
                size={26} 
                color={Colors.primary} 
              />
              <Text style={[styles.tagName, { color: Colors.text }]}>{result.name}</Text>
            </View>
            
            {result.status === 'owned' ? (
              <Text style={[styles.tagDetail, styles.zenText, { color: Colors.subText }]}>
                {`影像特徵比對成功！\n目前存量：${result.stock}\n庫存狀態：${result.isSufficient ? '供應充足' : '建議採購'}`}
              </Text>
            ) : (
              <View>
                <Text style={[styles.tagDetail, styles.zenText, { color: '#EF4444' }]}>
                  影像清單中無相似紀錄
                </Text>
                <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>建立影像索引並入庫</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={() => setResult(null)} style={styles.closeTag}>
              <Ionicons name="close-circle-outline" size={24} color={Colors.subText} />
            </TouchableOpacity>
          </View>
        )}

        {/* 底部控制欄 */}
        <View style={styles.bottomUI}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="barcode-outline" size={28} color="#FFF" />
            <Text style={styles.iconLabel}>條碼模式</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={performAIScan} disabled={isScanning} style={styles.scanMainBtn}>
            {isScanning ? <ActivityIndicator color="#FFF" /> : <Ionicons name="scan-circle" size={60} color="#FFF" />}
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="search-outline" size={28} color="#FFF" />
            <Text style={styles.iconLabel}>手動搜尋</Text>
          </TouchableOpacity>
        </View>
      </CameraView>

      {/* 影像入庫 Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.card }]}>
            <Text style={[styles.modalTitle, { color: Colors.text }]}>影像辨識結果</Text>
            <TextInput 
              style={[styles.input, styles.zenText, { color: Colors.text, borderColor: Colors.primary }]}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder="請輸入物品名稱"
              placeholderTextColor={Colors.subText}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.cancelBtn}>
                <Text style={[styles.zenText, { color: Colors.subText }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddToDB} style={[styles.confirmBtn, { backgroundColor: Colors.primary }]}>
                <Text style={[styles.zenText, { color: '#FFF', fontWeight: 'bold' }]}>確認入庫</Text>
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
  tabText: { fontFamily: 'ZenKurenaido', fontWeight: 'bold', fontSize: 13 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(139, 92, 246, 0.25)' },
  scanTargetBox: { width: SCREEN_WIDTH * 0.7, height: SCREEN_WIDTH * 0.7, borderWidth: 2, borderColor: '#A78BFA', borderRadius: 40, borderStyle: 'dashed' },
  scanningLabel: { color: '#FFF', marginTop: 30, fontSize: 16, letterSpacing: 2 },
  resultTag: { 
    position: 'absolute', top: 160, alignSelf: 'center', width: '88%', padding: 25, borderRadius: 35, 
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 15 
  },
  tagHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tagName: { fontFamily: 'ZenKurenaido', fontSize: 22, fontWeight: 'bold', marginLeft: 10 },
  tagDetail: { fontSize: 15, marginLeft: 36, lineHeight: 22 },
  closeTag: { position: 'absolute', top: 20, right: 20 },
  addBtn: { backgroundColor: '#8B5CF6', marginLeft: 36, marginTop: 15, paddingVertical: 10, paddingHorizontal: 25, borderRadius: 15, alignSelf: 'flex-start' },
  addBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
  bottomUI: { position: 'absolute', bottom: 50, flexDirection: 'row', width: '100%', justifyContent: 'space-around', alignItems: 'center' },
  scanMainBtn: { width: 95, height: 95, borderRadius: 50, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center', borderWidth: 6, borderColor: 'rgba(255,255,255,0.4)' },
  iconBtn: { alignItems: 'center' },
  iconLabel: { color: '#FFF', fontFamily: 'ZenKurenaido', fontSize: 11, marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', padding: 30, borderRadius: 40 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', fontFamily: 'ZenKurenaido', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1.5, borderRadius: 20, padding: 18, marginBottom: 25, fontSize: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { padding: 15, flex: 1, alignItems: 'center' },
  confirmBtn: { padding: 15, flex: 1, alignItems: 'center', borderRadius: 20 },
});