//個人清單頁面
import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from './firebaseConfig';

const { width } = Dimensions.get('window');
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '未定'];

// --- 型別定義 ---
interface Category {
  id: string;
  name: string;
  isConsumable: boolean;
  userId: string;
}

interface Product {
  id: string;
  categoryId: string;
  name: string;
  price?: string;
  image?: string;
  stock?: number;
  isStockAdequate?: boolean;
  arrivalMonth?: string;
  totalPrice?: string;
  paidAmount?: string;
  remainingAmount?: string;
  url?: string;
  type: 'owned' | 'preorder';
}

export default function SelfList() {
  let [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';

  // 狀態管理
  const [viewLevel, setViewLevel] = useState<'main' | 'detail'>('main');
  const [activeTab, setActiveTab] = useState<'owned' | 'preorder'>('owned');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [catModalVisible, setCatModalVisible] = useState(false);
  const [prodModalVisible, setProdModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // 新增：上傳狀態
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState('');
  const [isConsumable, setIsConsumable] = useState(false);
  const [productForm, setProductForm] = useState<Partial<Product>>({ arrivalMonth: '1月' });
  const [selectedImg, setSelectedImg] = useState<string | null>(null);

  const scrollX = useRef(new Animated.Value(0)).current;

  // --- Cloudinary 設定 ---
  const CLOUD_NAME = "dfbzt23lp"; // 🚩 請替換成你的 Cloud Name
  const UPLOAD_PRESET = "YesorNoself"; // 🚩 請替換成你的 Unsigned Preset 名稱

  const Colors = {
    bg: isDarkMode ? '#121212' : '#F1F5F9',
    card: isDarkMode ? '#1E293B' : '#FFFFFF',
    text: isDarkMode ? '#F8FAFC' : '#1E293B',
    subText: isDarkMode ? '#94A3B8' : '#64748B',
    primary: activeTab === 'owned' ? '#6366F1' : '#F43F5E',
    accent: '#10B981',
    inputBg: isDarkMode ? '#334155' : '#F8FAFC',
    border: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'categories'), where('userId', '==', auth.currentUser.uid));
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    const q = query(
      collection(db, 'products'),
      where('categoryId', '==', selectedCategory.id),
      where('type', '==', activeTab)
    );
    return onSnapshot(q, (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      if (activeTab === 'preorder') {
        data.sort((a, b) => MONTHS.indexOf(a.arrivalMonth!) - MONTHS.indexOf(b.arrivalMonth!));
      }
      setProducts(data);
    });
  }, [selectedCategory, activeTab]);

  const handleSwitchTab = (tab: 'owned' | 'preorder') => {
    setActiveTab(tab);
    Animated.spring(scrollX, {
      toValue: tab === 'owned' ? 0 : (width - 60) / 2,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled) {
      setSelectedImg(result.assets[0].uri);
    }
  };

  // --- Cloudinary 上傳邏輯 ---
  const uploadToCloudinary = async (uri: string) => {
    if (!uri || uri.startsWith('http')) return uri;

    const data = new FormData();
    data.append('file', {
      uri: uri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    } as any);
    data.append('upload_preset', UPLOAD_PRESET);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: data,
      });
      const result = await response.json();
      if (result.secure_url) {
        return result.secure_url;
      } else {
        throw new Error(result.error?.message || "上傳失敗");
      }
    } catch (error) {
      console.error("Cloudinary Error:", error);
      throw error;
    }
  };

  const saveProduct = async () => {
    if (!productForm.name || !selectedCategory) {
        Alert.alert("提示", "請輸入物品名稱");
        return;
    }
    
    setIsUploading(true); // 開始讀取

    try {
      // 1. 處理圖片上傳
      let finalImageUrl = productForm.image || '';
      if (selectedImg && !selectedImg.startsWith('http')) {
        finalImageUrl = await uploadToCloudinary(selectedImg);
      }

      // 2. 準備資料
      const data = {
        ...productForm,
        image: finalImageUrl,
        categoryId: selectedCategory.id,
        type: activeTab,
        userId: auth.currentUser?.uid,
        updatedAt: serverTimestamp()
      };

      // 3. 寫入 Firebase
      if (isEditing && editingId) {
        await updateDoc(doc(db, 'products', editingId), data);
      } else {
        await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
      }
      closeProdModal();
    } catch (error) {
      Alert.alert("上傳失敗", "無法儲存圖片或資料，請檢查 Cloudinary 設定");
    } finally {
      setIsUploading(false); // 結束讀取
    }
  };

  const openEditModal = (item: Product) => {
    setProductForm(item);
    setSelectedImg(item.image || null);
    setEditingId(item.id);
    setIsEditing(true);
    setProdModalVisible(true);
  };

  const closeProdModal = () => {
    setProdModalVisible(false);
    setIsEditing(false);
    setProductForm({ arrivalMonth: '1月' });
    setSelectedImg(null);
  };

  if (!fontsLoaded) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  );

  // --- 物品詳情頁 ---
  const renderProductDetail = () => (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => setViewLevel('main')} style={styles.glassBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>{selectedCategory?.name}</Text>
        <TouchableOpacity 
            onPress={() => setDisplayMode(displayMode === 'grid' ? 'list' : 'grid')} 
            style={[styles.glassBtn, { backgroundColor: Colors.primary + '20' }]}
        >
          <Ionicons name={displayMode === 'grid' ? "list-outline" : "grid-outline"} size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        key={displayMode}
        numColumns={displayMode === 'grid' ? 2 : 1}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-outline" size={60} color={Colors.subText} />
                <Text style={[styles.emptyText, { color: Colors.subText }]}>目前還沒有資料內容</Text>
            </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            activeOpacity={0.9}
            onLongPress={() => openEditModal(item)}
            onPress={() => openEditModal(item)}
            style={[
              displayMode === 'grid' ? styles.gridCard : styles.listCard,
              { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1 }
            ]}
          >
            <Image source={{ uri: item.image || 'https://via.placeholder.com/150' }} style={displayMode === 'grid' ? styles.gridImg : styles.listImg} />
            <View style={styles.infoArea}>
              <Text style={[styles.itemName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
              
              {activeTab === 'owned' ? (
                <View>
                  <Text style={[styles.priceTag, { color: Colors.primary }]}>$ {item.price || '0'}</Text>
                  {selectedCategory?.isConsumable && (
                    <View style={[styles.statusBadge, { backgroundColor: (item.stock || 0) > 0 ? '#E3F9E5' : '#FFEBEA' }]}>
                        <Text style={[styles.statusText, { color: (item.stock || 0) > 0 ? '#10B981' : '#F43F5E' }]}>
                            庫存: {item.stock || 0}
                        </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View>
                  <View style={styles.preorderHeader}>
                    <Text style={[styles.preorderText, {color: Colors.subText}]}>{item.arrivalMonth} 到貨</Text>
                    <Text style={[styles.remainingText, { color: Colors.primary }]}>待付: ${item.remainingAmount || 0}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { 
                        backgroundColor: Colors.primary, 
                        width: `${Math.min(100, (parseInt(item.paidAmount || '0') / (parseInt(item.totalPrice || '1') || 1)) * 100)}%` 
                    }]} />
                  </View>
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.delBtn} onPress={() => deleteDoc(doc(db, 'products', item.id))}>
              <Ionicons name="trash-outline" size={16} color="#F43F5E" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.primary }]} onPress={() => setProdModalVisible(true)}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>
    </View>
  );

  // --- 主頁面 ---
  const renderMainCategories = () => (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 25 }}>
        <Text style={[styles.mainTitle, { color: Colors.text }]}>清單收納室</Text>
        <Text style={[styles.subTitle, { color: Colors.subText }]}>整理你的生活，從這裡開始</Text>
      </View>

      <View style={styles.tabSection}>
        <View style={[styles.tabBar, { backgroundColor: isDarkMode ? '#222' : '#E2E8F0' }]}>
          <Animated.View style={[styles.tabIndicator, { backgroundColor: Colors.card, transform: [{ translateX: scrollX }] }]} />
          <TouchableOpacity style={styles.tabItem} onPress={() => handleSwitchTab('owned')}>
            <Text style={[styles.tabLabel, { color: activeTab === 'owned' ? Colors.primary : Colors.subText, fontWeight: activeTab === 'owned' ? 'bold' : 'normal' }]}>已擁有</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => handleSwitchTab('preorder')}>
            <Text style={[styles.tabLabel, { color: activeTab === 'preorder' ? Colors.primary : Colors.subText, fontWeight: activeTab === 'preorder' ? 'bold' : 'normal' }]}>已預購</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.catScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.catWrapper}>
          {categories.map(cat => (
            <TouchableOpacity 
              key={cat.id} 
              style={[styles.categoryCard, { backgroundColor: Colors.card }]}
              onPress={() => { setSelectedCategory(cat); setViewLevel('detail'); }}
            >
              <View style={[styles.bubbleIcon, { backgroundColor: Colors.primary + '15' }]}>
                <Ionicons name={cat.isConsumable ? "flask-outline" : "cube-outline"} size={24} color={Colors.primary} />
              </View>
              <Text style={[styles.bubbleName, { color: Colors.text }]}>{cat.name}</Text>
              <View style={[styles.typeBadge, { backgroundColor: cat.isConsumable ? '#FEF3C7' : '#DBEAFE' }]}>
                <Text style={[styles.typeText, { color: cat.isConsumable ? '#D97706' : '#2563EB' }]}>{cat.isConsumable ? "消耗品" : "耐久品"}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.primary }]} onPress={() => setCatModalVisible(true)}>
        <Ionicons name="folder" size={32} color="#FFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {viewLevel === 'main' ? renderMainCategories() : renderProductDetail()}

      {/* --- 新增/編輯商品 Modal --- */}
      <Modal visible={prodModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.card, height: '88%' }]}>
            <View style={styles.modalIndicator} />
            <Text style={[styles.modalHeader, { color: Colors.text }]}>{isEditing ? '修改內容' : '加入清單'}</Text>
            
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <TouchableOpacity style={[styles.imagePicker, { backgroundColor: Colors.inputBg }]} onPress={pickImage} disabled={isUploading}>
                {selectedImg ? (
                  <Image source={{ uri: selectedImg }} style={styles.previewImg} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={48} color={Colors.subText} />
                    <Text style={{color: Colors.subText, marginTop: 10, fontFamily: 'ZenKurenaido'}}>點擊上傳圖片</Text>
                  </View>
                )}
                {isUploading && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={{color: '#FFF', marginTop: 5}}>上傳中...</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={[styles.formLabel, {color: Colors.text}]}>基本資料</Text>
              <TextInput 
                style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} 
                placeholder="物品名稱" 
                value={productForm.name} 
                placeholderTextColor={Colors.subText} 
                onChangeText={t => setProductForm({...productForm, name: t})} 
              />
              
              {activeTab === 'owned' ? (
                <>
                  <TextInput 
                    style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} 
                    placeholder="購入價格" 
                    value={productForm.price} 
                    keyboardType="numeric" 
                    placeholderTextColor={Colors.subText} 
                    onChangeText={t => setProductForm({...productForm, price: t})} 
                  />
                  {selectedCategory?.isConsumable && (
                    <View style={styles.inlineInputRow}>
                      <Text style={[styles.formLabel, {color: Colors.text, marginBottom: 0}]}>目前剩餘庫存</Text>
                      <TextInput 
                        style={[styles.modalInput, { width: 100, marginBottom: 0, textAlign: 'center', backgroundColor: Colors.inputBg, color: Colors.text }]} 
                        value={productForm.stock?.toString()} 
                        keyboardType="numeric" 
                        onChangeText={t => setProductForm({...productForm, stock: parseInt(t) || 0})} 
                      />
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={[styles.formLabel, {color: Colors.text}]}>到貨月份：{productForm.arrivalMonth}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                    {MONTHS.map(m => (
                      <TouchableOpacity 
                        key={m} 
                        onPress={() => setProductForm({...productForm, arrivalMonth: m})} 
                        style={[styles.monthPick, { backgroundColor: productForm.arrivalMonth === m ? Colors.primary : Colors.inputBg }]}
                      >
                        <Text style={{ fontFamily: 'ZenKurenaido', color: productForm.arrivalMonth === m ? '#FFF' : Colors.text }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={styles.preorderInputs}>
                    <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.totalPrice} placeholder="商品總價" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, totalPrice: t})} />
                    <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.paidAmount} placeholder="已付定金" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, paidAmount: t})} />
                    <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.remainingAmount} placeholder="剩餘尾款" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, remainingAmount: t})} />
                  </View>
                </>
              )}
            </ScrollView>
            
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={closeProdModal} style={styles.cancelBtn} disabled={isUploading}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.mainBtn, {backgroundColor: isUploading ? '#CBD5E1' : Colors.primary}]} 
                onPress={saveProduct}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.mainBtnText}>{isEditing ? '更新內容' : '確認新增'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- 新增分類 Modal --- */}
      <Modal visible={catModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.card, height: 'auto', paddingBottom: 50 }]}>
            <View style={styles.modalIndicator} />
            <Text style={[styles.modalHeader, { color: Colors.text }]}>建立新分類</Text>
            <TextInput 
              style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} 
              placeholder="例如：彩妝、模型、保養品..." 
              placeholderTextColor={Colors.subText} 
              value={newCatName} 
              onChangeText={setNewCatName} 
            />
            <View style={styles.switchBox}>
              <Text style={[styles.formLabel, {marginBottom: 0, color: Colors.text}]}>啟用庫存管理 (消耗品)</Text>
              <Switch value={isConsumable} onValueChange={setIsConsumable} trackColor={{ true: Colors.primary }} />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => setCatModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelBtnText}>關閉</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, {backgroundColor: Colors.primary}]} onPress={async () => {
                if(!newCatName) return;
                await addDoc(collection(db, 'categories'), { name: newCatName, isConsumable, userId: auth.currentUser?.uid, createdAt: serverTimestamp() });
                setNewCatName(''); setCatModalVisible(false);
              }}>
                <Text style={styles.mainBtnText}>確認建立</Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mainTitle: { fontSize: 34, fontFamily: 'ZenKurenaido' },
  subTitle: { fontSize: 16, fontFamily: 'ZenKurenaido', marginBottom: 25, opacity: 0.8 },
  
  tabSection: { paddingHorizontal: 30, marginBottom: 25 },
  tabBar: { flexDirection: 'row', height: 55, borderRadius: 28, padding: 6 },
  tabIndicator: { position: 'absolute', width: '50%', height: '100%', borderRadius: 24, top: 6, left: 6, elevation: 2, shadowOpacity: 0.1 },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { fontSize: 16, fontFamily: 'ZenKurenaido' },

  catScroll: { paddingHorizontal: 20, paddingBottom: 120 },
  catWrapper: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryCard: { 
    width: '47%', padding: 20, borderRadius: 28, alignItems: 'center', marginBottom: 18, 
    elevation: 4, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10
  },
  bubbleIcon: { width: 55, height: 55, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  bubbleName: { fontSize: 18, fontFamily: 'ZenKurenaido' },
  typeBadge: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  typeText: { fontSize: 11, fontFamily: 'ZenKurenaido' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontFamily: 'ZenKurenaido' },
  glassBtn: { width: 45, height: 45, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },

  listContent: { padding: 20, paddingBottom: 100 },
  gridCard: { width: '47%', margin: '1.5%', borderRadius: 24, overflow: 'hidden', elevation: 3, shadowOpacity: 0.1, marginBottom: 20 },
  listCard: { flexDirection: 'row', marginBottom: 15, borderRadius: 24, padding: 12, alignItems: 'center', elevation: 2, shadowOpacity: 0.05 },
  gridImg: { width: '100%', height: 160 },
  listImg: { width: 90, height: 90, borderRadius: 18 },
  infoArea: { flex: 1, padding: 12 },
  itemName: { fontSize: 17, fontFamily: 'ZenKurenaido', marginBottom: 4 },
  priceTag: { fontSize: 18, fontFamily: 'ZenKurenaido' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  statusText: { fontSize: 11, fontFamily: 'ZenKurenaido' },
  
  preorderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  preorderText: { fontFamily: 'ZenKurenaido', fontSize: 12 },
  remainingText: { fontFamily: 'ZenKurenaido', fontSize: 14 },
  progressBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },

  delBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 12, padding: 6 },
  emptyContainer: { alignItems: 'center', marginTop: 100, opacity: 0.5 },
  emptyText: { marginTop: 15, fontFamily: 'ZenKurenaido', fontSize: 16 },

  fab: { position: 'absolute', right: 25, bottom: 40, width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowOpacity: 0.3 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalIndicator: { width: 40, height: 5, backgroundColor: '#CBD5E1', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  modalCard: { width: '100%', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 25, alignItems: 'center' },
  modalHeader: { fontSize: 24, fontFamily: 'ZenKurenaido',  marginBottom: 25 },
  modalInput: { width: '100%', padding: 18, borderRadius: 18, marginBottom: 15, fontFamily: 'ZenKurenaido', fontSize: 16 },
  formLabel: { alignSelf: 'flex-start', marginBottom: 12, fontSize: 15, fontFamily: 'ZenKurenaido', opacity: 0.7 },
  inlineInputRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: 20 },
  switchBox: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginVertical: 10 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 15 },
  cancelBtn: { paddingVertical: 15, paddingHorizontal: 25 },
  cancelBtnText: { color: '#94A3B8', fontFamily: 'ZenKurenaido', fontSize: 16 },
  mainBtn: { paddingVertical: 16, paddingHorizontal: 40, borderRadius: 20, elevation: 4, justifyContent: 'center', alignItems: 'center', minWidth: 140 },
  mainBtnText: { color: '#FFF', fontFamily: 'ZenKurenaido', fontSize: 16 },
  
  imagePicker: { width: '100%', height: 220, borderRadius: 25, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginBottom: 25, overflow: 'hidden', position: 'relative' },
  imagePlaceholder: { alignItems: 'center' },
  previewImg: { width: '100%', height: '100%' },
  uploadingOverlay: { position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  monthPick: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 15, marginRight: 10 },
  preorderInputs: { width: '100%' }
});