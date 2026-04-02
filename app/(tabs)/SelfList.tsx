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
    const [editingId, setEditingId] = useState<string | null>(null);

    const [newCatName, setNewCatName] = useState('');
    const [isConsumable, setIsConsumable] = useState(false);
    const [productForm, setProductForm] = useState<Partial<Product>>({ arrivalMonth: '1月' });
    const [selectedImg, setSelectedImg] = useState<string | null>(null);

    const scrollX = useRef(new Animated.Value(0)).current;

    const Colors = {
        bg: isDarkMode ? '#121212' : '#F8FAFC',
        card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
        text: isDarkMode ? '#FFFFFF' : '#2D3436',
        subText: isDarkMode ? '#A0A0A0' : '#636E72',
        primary: '#FF6F61',
        glow: isDarkMode ? 'rgba(255, 111, 97, 0.4)' : 'rgba(255, 111, 97, 0.2)',
        secondary: '#45AAF2',
        inputBg: isDarkMode ? '#2A2A2A' : '#F1F3F5',
    };

    // 監聽與排序
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
            toValue: tab === 'owned' ? 0 : (width - 40) / 2,
            useNativeDriver: true,
        }).start();
    };

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });
        if (!result.canceled) {
            setSelectedImg(result.assets[0].uri);
            setProductForm({ ...productForm, image: result.assets[0].uri });
        }
    };

    const saveProduct = async () => {
        if (!productForm.name || !selectedCategory) return;
        const data = {
            ...productForm,
            categoryId: selectedCategory.id,
            type: activeTab,
            userId: auth.currentUser?.uid,
            updatedAt: serverTimestamp()
        };

        if (isEditing && editingId) {
            await updateDoc(doc(db, 'products', editingId), data);
        } else {
            await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
        }
        
        closeProdModal();
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

    if (!fontsLoaded) return <ActivityIndicator style={{ flex: 1 }} color="#FF6F61" />;

    // --- 物品詳情頁 ---
    const renderProductDetail = () => (
        <View style={{ flex: 1 }}>
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => setViewLevel('main')} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={28} color={Colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: Colors.text }]}>{selectedCategory?.name}</Text>
                <TouchableOpacity onPress={() => setDisplayMode(displayMode === 'grid' ? 'list' : 'grid')} style={styles.iconBtn}>
                    <Ionicons name={displayMode === 'grid' ? "layers-outline" : "grid-outline"} size={24} color={Colors.primary} />
                </TouchableOpacity>
            </View>

            <FlatList
                data={products}
                key={displayMode}
                numColumns={displayMode === 'grid' ? 2 : 1}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        activeOpacity={0.9}
                        onLongPress={() => openEditModal(item)}
                        onPress={() => openEditModal(item)}
                        style={[
                            displayMode === 'grid' ? styles.gridCard : styles.listCard,
                            { backgroundColor: Colors.card, shadowColor: Colors.primary }
                        ]}
                    >
                        <Image source={{ uri: item.image || 'https://via.placeholder.com/150' }} style={displayMode === 'grid' ? styles.gridImg : styles.listImg} />
                        <View style={styles.infoArea}>
                            <Text style={[styles.itemName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
                            {activeTab === 'owned' ? (
                                <View>
                                    <Text style={[styles.priceTag, { color: Colors.primary }]}>NT$ {item.price || '0'}</Text>
                                    {selectedCategory?.isConsumable && (
                                        <View style={[styles.statusBadge, { backgroundColor: item.isStockAdequate ? '#E3F9E5' : '#FFEBEA' }]}>
                                            <Text style={[styles.statusText, { color: item.isStockAdequate ? '#1B5E20' : '#C62828' }]}>
                                                庫存: {item.stock || 0}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <View>
                                    <Text style={styles.preorderText}>預計: {item.arrivalMonth}</Text>
                                    <Text style={styles.remainingText}>待付: ${item.remainingAmount || 0}</Text>
                                </View>
                            )}
                        </View>
                        <TouchableOpacity style={styles.delBtn} onPress={() => deleteDoc(doc(db, 'products', item.id))}>
                            <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
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
            <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 25 }}>
                <Text style={[styles.mainTitle, { color: Colors.text }]}>個人清單</Text>
                <Text style={[styles.subTitle, { color: Colors.subText }]}>收藏與預購的完美收納</Text>
            </View>

            <View style={styles.tabSection}>
                <View style={[styles.tabBar, { backgroundColor: isDarkMode ? '#222' : '#E0E0E0' }]}>
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
                            style={[styles.categoryBubble, { backgroundColor: Colors.card, shadowColor: Colors.primary }]}
                            onPress={() => { setSelectedCategory(cat); setViewLevel('detail'); }}
                        >
                            <View style={[styles.bubbleIcon, { backgroundColor: isDarkMode ? '#333' : '#FFF5F4' }]}>
                                <Ionicons name={cat.isConsumable ? "flask-outline" : "cube-outline"} size={26} color={Colors.primary} />
                            </View>
                            <Text style={[styles.bubbleName, { color: Colors.text }]}>{cat.name}</Text>
                            <View style={[styles.typeBadge, { backgroundColor: cat.isConsumable ? '#FFEAA7' : '#DFF9FB' }]}>
                                <Text style={styles.typeText}>{cat.isConsumable ? "消耗品" : "耐久品"}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.primary }]} onPress={() => setCatModalVisible(true)}>
                <Ionicons name="folder-outline" size={28} color="#FFF" />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: Colors.bg }]}>
            {viewLevel === 'main' ? renderMainCategories() : renderProductDetail()}

            {/* --- 新增/編輯商品 Modal --- */}
            <Modal visible={prodModalVisible} transparent animationType="slide">
                <View style={styles.overlay}>
                    <View style={[styles.modalCard, { backgroundColor: Colors.card, height: '85%' }]}>
                        <Text style={[styles.modalHeader, { color: Colors.text }]}>{isEditing ? '編輯物品' : '新增物品'}</Text>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
                            <TouchableOpacity style={[styles.imagePicker, { backgroundColor: Colors.inputBg }]} onPress={pickImage}>
                                {selectedImg ? (
                                    <Image source={{ uri: selectedImg }} style={styles.previewImg} />
                                ) : (
                                    <Ionicons name="camera-outline" size={40} color={Colors.subText} />
                                )}
                            </TouchableOpacity>

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
                                        placeholder="購買價格" 
                                        value={productForm.price} 
                                        keyboardType="numeric" 
                                        placeholderTextColor={Colors.subText} 
                                        onChangeText={t => setProductForm({...productForm, price: t})} 
                                    />
                                    {selectedCategory?.isConsumable && (
                                        <View style={styles.switchBox}>
                                            <Text style={styles.formLabel}>目前庫存</Text>
                                            <TextInput 
                                                style={[styles.modalInput, { width: 80, marginBottom: 0, textAlign: 'center' }]} 
                                                value={productForm.stock?.toString()} 
                                                keyboardType="numeric" 
                                                onChangeText={t => setProductForm({...productForm, stock: parseInt(t) || 0})} 
                                            />
                                        </View>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Text style={styles.formLabel}>預計到貨月份：</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
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
                                    <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.totalPrice} placeholder="總金額" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, totalPrice: t})} />
                                    <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.paidAmount} placeholder="已付金額" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, paidAmount: t})} />
                                    <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.remainingAmount} placeholder="剩餘金額" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, remainingAmount: t})} />
                                </>
                            )}
                        </ScrollView>
                        <View style={styles.actionRow}>
                            <TouchableOpacity onPress={closeProdModal}><Text style={styles.cancelBtnText}>取消</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.mainBtn} onPress={saveProduct}><Text style={styles.mainBtnText}>{isEditing ? '更新' : '確認新增'}</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* --- 新增分類 Modal --- */}
            <Modal visible={catModalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <View style={[styles.modalCard, { backgroundColor: Colors.card }]}>
                        <Text style={[styles.modalHeader, { color: Colors.text }]}>新分類</Text>
                        <TextInput 
                            style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} 
                            placeholder="類別名稱..." 
                            placeholderTextColor={Colors.subText} 
                            value={newCatName} 
                            onChangeText={setNewCatName} 
                        />
                        <View style={styles.switchBox}>
                            <Text style={styles.formLabel}>設定為消耗品</Text>
                            <Switch value={isConsumable} onValueChange={setIsConsumable} trackColor={{ true: Colors.primary }} />
                        </View>
                        <View style={styles.actionRow}>
                            <TouchableOpacity onPress={() => setCatModalVisible(false)}><Text style={styles.cancelBtnText}>取消</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.mainBtn} onPress={async () => {
                                if(!newCatName) return;
                                await addDoc(collection(db, 'categories'), { name: newCatName, isConsumable, userId: auth.currentUser?.uid, createdAt: serverTimestamp() });
                                setNewCatName(''); setCatModalVisible(false);
                            }}><Text style={styles.mainBtnText}>建立</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    mainTitle: { fontSize: 32, fontFamily: 'ZenKurenaido',  letterSpacing: 1 },
    subTitle: { fontSize: 14, fontFamily: 'ZenKurenaido', marginBottom: 20 },
    
    // --- Tab 樣式 ---
    tabSection: { paddingHorizontal: 25, marginBottom: 20 },
    tabBar: { flexDirection: 'row', height: 50, borderRadius: 25, padding: 5 },
    tabIndicator: { position: 'absolute', width: '50%', height: '100%', borderRadius: 22, top: 5, left: 5, elevation: 3 },
    tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabLabel: { fontSize: 16, fontFamily: 'ZenKurenaido' },

    // --- 分類卡片 ---
    catScroll: { paddingHorizontal: 20, paddingBottom: 100 },
    catWrapper: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    categoryBubble: { 
        width: '48%', padding: 20, borderRadius: 30, alignItems: 'center', marginBottom: 15, 
        elevation: 10, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 
    },
    bubbleIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    bubbleName: { fontSize: 18, fontFamily: 'ZenKurenaido' },
    typeBadge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    typeText: { fontSize: 10, fontFamily: 'ZenKurenaido' },

    // --- 詳情頁 Header ---
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingBottom: 15 },
    headerTitle: { fontSize: 22, fontFamily: 'ZenKurenaido' },
    iconBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },

    // --- 商品列表/網格 ---
    listContent: { padding: 15, paddingBottom: 100 },
    gridCard: { width: '47%', margin: '1.5%', borderRadius: 25, overflow: 'hidden', elevation: 8, shadowOpacity: 0.2, marginBottom: 20 },
    listCard: { flexDirection: 'row', marginBottom: 15, borderRadius: 25, padding: 12, alignItems: 'center', elevation: 5, shadowOpacity: 0.1 },
    gridImg: { width: '100%', height: 150 },
    listImg: { width: 85, height: 85, borderRadius: 20 },
    infoArea: { flex: 1, padding: 12 },
    itemName: { fontSize: 16, fontFamily: 'ZenKurenaido',  marginBottom: 5 },
    priceTag: { fontSize: 15, fontFamily: 'ZenKurenaido', marginTop: 2 },
    statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 5 },
    statusText: { fontSize: 10, fontFamily: 'ZenKurenaido' },
    preorderText: { fontFamily: 'ZenKurenaido', fontSize: 12, color: '#636E72' },
    remainingText: { fontFamily: 'ZenKurenaido',  fontSize: 13, color: '#45AAF2' },
    delBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 15, padding: 4 },

    // --- 月份選擇器 ---
    monthPick: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, marginRight: 8 },

    // --- 懸浮按鈕 ---
    fab: { position: 'absolute', right: 25, bottom: 40, width: 65, height: 65, borderRadius: 33, justifyContent: 'center', alignItems: 'center', elevation: 10 },

    // --- Modal 彈窗 ---
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalCard: { width: '100%', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 30, alignItems: 'center' },
    modalHeader: { fontSize: 24, fontFamily: 'ZenKurenaido', marginBottom: 25 },
    modalInput: { width: '100%', padding: 18, borderRadius: 20, marginBottom: 15, fontFamily: 'ZenKurenaido' },
    formLabel: { color: '#2D3436', marginBottom: 10, fontSize: 14, fontFamily: 'ZenKurenaido' },
    switchBox: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: 20 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 20, alignItems: 'center' },
    cancelBtnText: { color: '#636E72', fontFamily: 'ZenKurenaido' },
    mainBtn: { backgroundColor: '#FF6F61', paddingVertical: 14, paddingHorizontal: 35, borderRadius: 25 },
    mainBtnText: { color: '#FFF', fontFamily: 'ZenKurenaido' },
    imagePicker: { width: '100%', height: 200, borderRadius: 25, borderStyle: 'dashed', borderWidth: 2, borderColor: '#DDD', justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
    previewImg: { width: '100%', height: '100%' }
});