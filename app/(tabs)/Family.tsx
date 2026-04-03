import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
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
  Modal,
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

// Cloudinary 設定
const CLOUD_NAME = "dfbzt23lp"; 
const UPLOAD_PRESET = "YesorNoself"; 

interface Category {
  id: string;
  name: string;
  isConsumable: boolean;
  familyId: string;
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
  familyId: string;
}

export default function FamilyList() {
  let [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';

  const Colors = {
    bg: isDarkMode ? '#0F0F12' : '#F2F4F7',
    card: isDarkMode ? '#1C1C23' : '#FFFFFF',
    text: isDarkMode ? '#F0F0F5' : '#1D1D1F',
    subText: isDarkMode ? '#A1A1AA' : '#64748B',
    primary: '#7C69EF',
    secondary: '#A78BFA',
    inputBg: isDarkMode ? '#2A2A35' : '#E9ECEF',
    glow: isDarkMode ? 'rgba(124, 105, 239, 0.4)' : 'rgba(0, 0, 0, 0.05)',
    border: isDarkMode ? '#33333F' : '#E2E8F0',
  };

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewLevel, setViewLevel] = useState<'main' | 'detail'>('main');
  const [activeTab, setActiveTab] = useState<'owned' | 'preorder'>('owned');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [prodModalVisible, setProdModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [isConsumable, setIsConsumable] = useState(false);
  const [productForm, setProductForm] = useState<Partial<Product>>({ arrivalMonth: '1月', isStockAdequate: true });
  const [selectedImg, setSelectedImg] = useState<string | null>(null);

  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fetchUserFamilyRelation = async () => {
      if (!auth.currentUser) { setLoadingFamily(false); return; }
      try {
        const q = query(collection(db, 'family_members'), where('userId', '==', auth.currentUser.uid));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          setFamilyId(querySnapshot.docs[0].data().familyId);
        }
      } catch (error) { console.error(error); } 
      finally { setLoadingFamily(false); }
    };
    fetchUserFamilyRelation();
  }, []);

  useEffect(() => {
    if (!familyId) return;
    const q = query(collection(db, 'categories'), where('familyId', '==', familyId));
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });
  }, [familyId]);

  useEffect(() => {
    if (!selectedCategory || !familyId) return;
    const q = query(
      collection(db, 'products'),
      where('categoryId', '==', selectedCategory.id),
      where('familyId', '==', familyId),
      where('type', '==', activeTab)
    );
    return onSnapshot(q, (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      if (activeTab === 'preorder') {
        data.sort((a, b) => MONTHS.indexOf(a.arrivalMonth!) - MONTHS.indexOf(b.arrivalMonth!));
      }
      setProducts(data);
    });
  }, [selectedCategory, activeTab, familyId]);

  const handleSwitchTab = (tab: 'owned' | 'preorder') => {
    setActiveTab(tab);
    Animated.spring(scrollX, {
      toValue: tab === 'owned' ? 0 : (width - 50) / 2, // 修正滑動長度計算
      useNativeDriver: true,
    }).start();
  };

  // Cloudinary 上傳邏輯修正
  const uploadToCloudinary = async (uri: string): Promise<string | null> => {
    setUploading(true);
    const data = new FormData();
    // @ts-ignore
    data.append('file', {
      uri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    });
    data.append('upload_preset', UPLOAD_PRESET);

    try {
      // 修正：必須使用完整的 API URL 加上 Cloud Name
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: data,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = await response.json();
      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary Upload Error:', error);
      Alert.alert('圖片上傳失敗');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    
    if (!result.canceled) {
      const localUri = result.assets[0].uri;
      setSelectedImg(localUri); 
      const remoteUrl = await uploadToCloudinary(localUri);
      if (remoteUrl) {
        setProductForm(prev => ({ ...prev, image: remoteUrl }));
      }
    }
  };

  const saveProduct = async () => {
    if (!productForm.name || !selectedCategory || !familyId) {
        Alert.alert('請輸入必填欄位');
        return;
    }
    if (uploading) { Alert.alert('請等待圖片上傳完成'); return; }

    const data = { 
      ...productForm, 
      categoryId: selectedCategory.id, 
      familyId, 
      type: activeTab, 
      updatedAt: serverTimestamp() 
    };

    try {
        if (isEditing && editingId) {
          await updateDoc(doc(db, 'products', editingId), data);
        } else {
          await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
        }
        closeProdModal();
    } catch (e) {
        console.error(e);
        Alert.alert('儲存失敗');
    }
  };

  const closeProdModal = () => {
    setProdModalVisible(false);
    setIsEditing(false);
    setEditingId(null);
    setProductForm({ arrivalMonth: '1月', isStockAdequate: true });
    setSelectedImg(null);
  };

  if (!fontsLoaded || loadingFamily) return <ActivityIndicator style={{ flex: 1 }} color="#7C69EF" />;

  if (!familyId) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <View style={[styles.emptyCircle, { backgroundColor: Colors.card, shadowColor: Colors.primary }]}>
          <Ionicons name="people-outline" size={60} color={Colors.primary} />
        </View>
        <Text style={[styles.emptyText, { color: Colors.text }]}>尚未加入家庭</Text>
        <Text style={[styles.emptySub, { color: Colors.subText }]}>請前往首頁輸入邀請碼加入</Text>
      </View>
    );
  }

  const renderDetail = () => (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => setViewLevel('main')} style={[styles.iconBtn, { backgroundColor: Colors.inputBg }]}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>{selectedCategory?.name}</Text>
        <TouchableOpacity onPress={() => setDisplayMode(displayMode === 'grid' ? 'list' : 'grid')} style={[styles.iconBtn, { backgroundColor: Colors.inputBg }]}>
          <Ionicons name={displayMode === 'grid' ? "list" : "grid"} size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        key={displayMode}
        numColumns={displayMode === 'grid' ? 2 : 1}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity 
            onPress={() => { 
                setProductForm(item); 
                setSelectedImg(item.image || null); 
                setEditingId(item.id); 
                setIsEditing(true); 
                setProdModalVisible(true); 
            }}
            style={[displayMode === 'grid' ? styles.gridCard : styles.listCard, { backgroundColor: Colors.card, shadowColor: Colors.glow, borderColor: Colors.border, borderWidth: 1 }]}
          >
            <Image source={{ uri: item.image || 'https://via.placeholder.com/150' }} style={displayMode === 'grid' ? styles.gridImg : styles.listImg} />
            <View style={styles.infoArea}>
              <Text style={[styles.itemName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
              {activeTab === 'owned' ? (
                <>
                  <Text style={[styles.priceTag, { color: Colors.primary }]}>$ {item.price || '0'}</Text>
                  {selectedCategory?.isConsumable && (
                    <View style={[styles.statusBadge, { backgroundColor: item.isStockAdequate ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)' }]}>
                      <Text style={[styles.statusText, { color: item.isStockAdequate ? '#34D399' : '#F87171' }]}>庫存: {item.stock || 0}</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={[styles.preorderText, { color: Colors.subText }]}>{item.arrivalMonth} 預計</Text>
                  <Text style={[styles.remainingText, { color: '#45AAF2' }]}>待付: ${item.totalPrice ? (Number(item.totalPrice) - Number(item.paidAmount || 0)) : 0}</Text>
                </>
              )}
            </View>
            <TouchableOpacity style={styles.delBtn} onPress={() => {
                Alert.alert("刪除物品", "確定要刪除嗎？", [
                    { text: "取消", style: "cancel" },
                    { text: "刪除", style: "destructive", onPress: () => deleteDoc(doc(db, 'products', item.id)) }
                ]);
            }}>
              <Ionicons name="trash-outline" size={16} color="#F87171" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.primary, shadowColor: Colors.primary }]} onPress={() => setProdModalVisible(true)}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {viewLevel === 'main' ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 25, marginBottom: 25 }}>
            <Text style={[styles.mainTitle, { color: Colors.text }]}>家庭空間</Text>
            <Text style={[styles.subTitle, { color: Colors.subText }]}>共享庫存與購物清單</Text>
          </View>

          <View style={styles.tabSection}>
            <View style={[styles.tabBar, { backgroundColor: Colors.inputBg }]}>
              <Animated.View style={[styles.tabIndicator, { backgroundColor: Colors.card, transform: [{ translateX: scrollX }] }]} />
              <TouchableOpacity style={styles.tabItem} onPress={() => handleSwitchTab('owned')}>
                <Text style={[styles.tabLabel, { color: activeTab === 'owned' ? Colors.primary : Colors.subText }]}>已擁有</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tabItem} onPress={() => handleSwitchTab('preorder')}>
                <Text style={[styles.tabLabel, { color: activeTab === 'preorder' ? Colors.primary : Colors.subText }]}>已預購</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.catScroll}>
            <View style={styles.catWrapper}>
              {categories.map(cat => (
                <TouchableOpacity 
                  key={cat.id} 
                  style={[styles.categoryBubble, { backgroundColor: Colors.card, shadowColor: Colors.glow, borderColor: Colors.border, borderWidth: 1 }]}
                  onPress={() => { setSelectedCategory(cat); setViewLevel('detail'); }}
                >
                  <View style={[styles.iconCircle, { backgroundColor: Colors.inputBg }]}>
                    <Ionicons name={cat.isConsumable ? "fast-food" : "cube"} size={22} color={Colors.primary} />
                  </View>
                  <Text style={[styles.bubbleName, { color: Colors.text }]}>{cat.name}</Text>
                  <View style={[styles.typeBadge, { backgroundColor: cat.isConsumable ? 'rgba(255, 184, 0, 0.1)' : 'rgba(124, 105, 239, 0.1)' }]}>
                    <Text style={[styles.typeText, { color: cat.isConsumable ? '#FFB800' : Colors.primary }]}>{cat.isConsumable ? "消耗品" : "耐久品"}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.primary, shadowColor: Colors.primary }]} onPress={() => setCatModalVisible(true)}>
            <Ionicons name="folder-open" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      ) : renderDetail()}

      {/* 分類 Modal 修正標籤 */}
      <Modal visible={catModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.card }]}>
            <View style={styles.modalIndicator} />
            <Text style={[styles.modalHeader, { color: Colors.text }]}>建立家庭分類</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="例如：冰箱冷藏、浴室用品" placeholderTextColor={Colors.subText} value={newCatName} onChangeText={setNewCatName} />
            <View style={styles.switchBox}>
              <Text style={[styles.formLabel, { color: Colors.text }]}>設定為消耗品 (可管理庫存)</Text>
              <Switch value={isConsumable} onValueChange={setIsConsumable} trackColor={{ true: Colors.primary }} />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => setCatModalVisible(false)} style={styles.cancelBtn}>
                <Text style={[styles.cancelBtnText, { color: Colors.subText }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, {backgroundColor: Colors.primary}]} onPress={async () => {
                if(!newCatName || !familyId) return;
                await addDoc(collection(db, 'categories'), { name: newCatName, isConsumable, familyId, createdAt: serverTimestamp() });
                setNewCatName(''); setCatModalVisible(false);
              }}>
                  <Text style={styles.mainBtnText}>確認建立</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 物品 Modal */}
      <Modal visible={prodModalVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.card, height: '90%' }]}>
            <View style={styles.modalIndicator} />
            <Text style={[styles.modalHeader, { color: Colors.text }]}>{isEditing ? '修改內容' : '新增物品'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <TouchableOpacity style={[styles.imagePicker, { backgroundColor: Colors.inputBg, borderColor: Colors.border }]} onPress={pickImage} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : selectedImg ? (
                  <Image source={{ uri: selectedImg }} style={styles.previewImg} />
                ) : (
                  <View style={{alignItems:'center'}}>
                    <Ionicons name="camera" size={32} color={Colors.subText} />
                    <Text style={{fontFamily:'ZenKurenaido', color:Colors.subText, marginTop:8}}>上傳照片</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={[styles.inputLabel, { color: Colors.text }]}>物品名稱</Text>
              <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="請輸入名稱" placeholderTextColor={Colors.subText} value={productForm.name} onChangeText={t => setProductForm({...productForm, name: t})} />
              
              {activeTab === 'owned' ? (
                <>
                  <Text style={[styles.inputLabel, { color: Colors.text }]}>金額</Text>
                  <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="0" keyboardType="numeric" value={productForm.price} onChangeText={t => setProductForm({...productForm, price: t})} />
                  {selectedCategory?.isConsumable && (
                    <>
                      <Text style={[styles.inputLabel, { color: Colors.text }]}>目前庫存</Text>
                      <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="0" keyboardType="numeric" value={productForm.stock?.toString()} onChangeText={t => setProductForm({...productForm, stock: parseInt(t) || 0})} />
                      <View style={styles.switchBox}>
                        <Text style={[styles.formLabel, { color: Colors.text }]}>庫存狀況充足</Text>
                        <Switch value={productForm.isStockAdequate} onValueChange={v => setProductForm({...productForm, isStockAdequate: v})} trackColor={{ true: Colors.primary }} />
                      </View>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Text style={[styles.inputLabel, { color: Colors.text }]}>網址</Text>
                  <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="貼上購物連結" placeholderTextColor={Colors.subText} value={productForm.url} onChangeText={t => setProductForm({...productForm, url: t})} />
                  <Text style={[styles.inputLabel, { color: Colors.text }]}>預計到達月份</Text>
                  <View style={styles.monthScroll}>
                    {MONTHS.map(m => (
                      <TouchableOpacity key={m} onPress={() => setProductForm({...productForm, arrivalMonth: m})} style={[styles.monthPick, { backgroundColor: productForm.arrivalMonth === m ? Colors.primary : Colors.inputBg }]}>
                        <Text style={{ fontFamily: 'ZenKurenaido', color: productForm.arrivalMonth === m ? '#FFF' : Colors.text }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ width: '48%' }}>
                      <Text style={[styles.inputLabel, { color: Colors.text }]}>總價</Text>
                      <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="0" keyboardType="numeric" value={productForm.totalPrice} onChangeText={t => setProductForm({...productForm, totalPrice: t})} />
                    </View>
                    <View style={{ width: '48%' }}>
                      <Text style={[styles.inputLabel, { color: Colors.text }]}>已付金額</Text>
                      <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="0" keyboardType="numeric" value={productForm.paidAmount} onChangeText={t => setProductForm({...productForm, paidAmount: t})} />
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={closeProdModal} style={styles.cancelBtn}><Text style={[styles.cancelBtnText, { color: Colors.subText }]}>取消</Text></TouchableOpacity>
              <TouchableOpacity 
                style={[styles.mainBtn, {backgroundColor: uploading ? Colors.subText : Colors.primary}]} 
                onPress={saveProduct}
                disabled={uploading}
              >
                <Text style={styles.mainBtnText}>{uploading ? '上傳中...' : '確認儲存'}</Text>
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
  emptyCircle: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 20, elevation: 15, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 15 },
  emptyText: { fontSize: 24, fontFamily: 'ZenKurenaido' },
  emptySub: { fontSize: 16, fontFamily: 'ZenKurenaido', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 22, fontFamily: 'ZenKurenaido' },
  iconBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  mainTitle: { fontSize: 34, fontFamily: 'ZenKurenaido',  letterSpacing: 1 },
  subTitle: { fontSize: 16, fontFamily: 'ZenKurenaido' },
  tabSection: { paddingHorizontal: 25, marginBottom: 20 },
  tabBar: { flexDirection: 'row', height: 54, borderRadius: 16, padding: 4 },
  tabIndicator: { position: 'absolute', width: '50%', height: '100%', borderRadius: 12, top: 4, left: 4, elevation: 4 },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { fontSize: 16, fontFamily: 'ZenKurenaido' },
  catScroll: { paddingHorizontal: 20, paddingBottom: 100 },
  catWrapper: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryBubble: { width: '48%', padding: 20, borderRadius: 24, alignItems: 'center', marginBottom: 15, elevation: 10, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  bubbleName: { fontSize: 18, fontFamily: 'ZenKurenaido' },
  typeBadge: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  typeText: { fontSize: 11, fontFamily: 'ZenKurenaido' },
  listContent: { padding: 15, paddingBottom: 100 },
  gridCard: { width: '47%', margin: '1.5%', borderRadius: 20, overflow: 'hidden', elevation: 8, marginBottom: 20, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2 },
  listCard: { flexDirection: 'row', marginBottom: 15, borderRadius: 20, padding: 12, alignItems: 'center', elevation: 5, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1 },
  gridImg: { width: '100%', height: 130 },
  listImg: { width: 80, height: 80, borderRadius: 12 },
  infoArea: { flex: 1, padding: 12 },
  itemName: { fontSize: 16, fontFamily: 'ZenKurenaido' },
  priceTag: { fontSize: 18, fontFamily: 'ZenKurenaido', marginTop: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 8 },
  statusText: { fontSize: 12, fontFamily: 'ZenKurenaido' },
  preorderText: { fontSize: 12, fontFamily: 'ZenKurenaido', marginTop: 2 },
  remainingText: { fontSize: 14, fontFamily: 'ZenKurenaido', marginTop: 4 },
  delBtn: { position: 'absolute', top: 8, right: 8, padding: 4 },
  fab: { position: 'absolute', right: 25, bottom: 30, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 12, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { width: '100%', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 25, alignItems: 'center' },
  modalIndicator: { width: 40, height: 5, backgroundColor: '#DDD', borderRadius: 3, marginBottom: 20 },
  modalHeader: { fontSize: 24, fontFamily: 'ZenKurenaido',  marginBottom: 20 },
  inputLabel: { alignSelf: 'flex-start', fontFamily: 'ZenKurenaido', fontSize: 14, marginBottom: 8, marginLeft: 4 },
  modalInput: { width: '100%', padding: 16, borderRadius: 16, marginBottom: 16, fontFamily: 'ZenKurenaido', fontSize: 16 },
  switchBox: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginVertical: 10, paddingHorizontal: 5 },
  formLabel: { fontFamily: 'ZenKurenaido', fontSize: 15 },
  monthScroll: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 },
  monthPick: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, margin: 4 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 30 },
  cancelBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { fontFamily: 'ZenKurenaido', fontSize: 16},
  mainBtn: { flex: 2, paddingVertical: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  mainBtnText: { color: '#FFF',  fontFamily: 'ZenKurenaido', fontSize: 16 },
  imagePicker: { width: '100%', height: 180, borderRadius: 20, borderStyle: 'dashed', borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' }
});