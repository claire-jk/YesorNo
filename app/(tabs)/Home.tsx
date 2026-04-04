import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Modal,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    useColorScheme,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Firebase
import { onAuthStateChanged } from 'firebase/auth';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    where
} from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

// Moti 動畫
import { AnimatePresence, MotiView } from 'moti';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

interface WishItem { id: string; name: string; createdAt?: any; }
interface Family { id: string; name: string; inviteCode: string; }
interface Activity {
    id: string;
    type: 'self' | 'family' | 'owned' | 'preorder';
    itemName: string;
    time: number;
}

export default function Home() {
    let [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });

    const [mode, setMode] = useState<'self' | 'family'>('self');
    const [wishList, setWishList] = useState<WishItem[]>([]);
    const [familyWishList, setFamilyWishList] = useState<WishItem[]>([]);
    const [productActivities, setProductActivities] = useState<Activity[]>([]); // 新增：產品動態
    const [activities, setActivities] = useState<Activity[]>([]); 
    const [families, setFamilies] = useState<Family[]>([]);
    const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
    
    const [isDataInitialized, setIsDataInitialized] = useState(false);
    const isInitialMount = useRef(true);

    const [modalVisible, setModalVisible] = useState(false);
    const [newItemName, setNewItemName] = useState('');

    const isDarkMode = useColorScheme() === 'dark';
    const insets = useSafeAreaInsets();
    const scrollX = useRef(new Animated.Value(0)).current;

    const Colors = {
        bg: isDarkMode ? '#0F172A' : '#FBFBFF',
        card: isDarkMode ? '#1E293B' : '#FFFFFF',
        text: isDarkMode ? '#F8FAFC' : '#1E293B',
        subText: isDarkMode ? '#94A3B8' : '#64748B',
        primary: '#FF6F61',
        familyAccent: '#6366F1',
        selfAccent: '#10B981',
        preorderAccent: '#F43F5E',
        inputBg: isDarkMode ? '#2C2C2C' : '#F1F5F9',
    };

    const switchMode = (target: 'self' | 'family') => {
        setMode(target);
        Animated.spring(scrollX, {
            toValue: target === 'self' ? 0 : width / 2 - 24,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    // Firebase 核心監聽
    useEffect(() => {
        let unsubSelf: (() => void) | undefined;
        let unsubFamMembers: (() => void) | undefined;
        let unsubProducts: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (!user) { setIsDataInitialized(true); return; }

            // 1. 監聽個人心願單
            const qSelf = query(collection(db, 'wishlist'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
            unsubSelf = onSnapshot(qSelf, (snap) => {
                setWishList(snap.docs.map(d => ({ id: d.id, name: d.data().name, createdAt: d.data().createdAt })));
            });

            // 2. 監聽個人產品動態 (來自 SelfList.tsx 的已擁有/已預購)
            const qProducts = query(collection(db, 'products'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
            unsubProducts = onSnapshot(qProducts, (snap) => {
                const prods = snap.docs.map(d => ({
                    id: d.id,
                    type: d.data().type as 'owned' | 'preorder',
                    itemName: d.data().name,
                    time: d.data().createdAt?.toMillis() || Date.now()
                } as Activity));
                setProductActivities(prods);
            });

            // 3. 監聽家庭成員關係
            const qFamMember = query(collection(db, 'family_members'), where('userId', '==', user.uid));
            unsubFamMembers = onSnapshot(qFamMember, async (snap) => {
                if (snap.empty) { setFamilies([]); setIsDataInitialized(true); return; }
                const famIds = Array.from(new Set(snap.docs.map(d => d.data().familyId)));
                const famDataList: Family[] = [];
                for (const fId of famIds) {
                    const fDoc = await getDocs(query(collection(db, 'families'), where('__name__', '==', fId)));
                    fDoc.forEach(d => famDataList.push({ id: d.id, ...d.data() } as Family));
                }
                setFamilies(famDataList);
                if (famDataList.length > 0 && isInitialMount.current) {
                    const savedId = await AsyncStorage.getItem('currentFamilyId');
                    let targetFamily = savedId ? famDataList.find(f => f.id === savedId) : famDataList[0];
                    setCurrentFamily(targetFamily || famDataList[0]);
                    isInitialMount.current = false;
                }
                setIsDataInitialized(true);
            });
        });
        return () => { 
            unsubscribeAuth(); 
            unsubSelf?.(); 
            unsubFamMembers?.(); 
            unsubProducts?.(); 
        };
    }, []);

    // 監聽當前家庭的心願單
    useEffect(() => {
        if (!currentFamily) { setFamilyWishList([]); return; }
        const qFamWish = query(collection(db, 'family_wishlist'), where('familyId', '==', currentFamily.id), orderBy('createdAt', 'desc'));
        return onSnapshot(qFamWish, (snap) => {
            setFamilyWishList(snap.docs.map(d => ({ id: d.id, name: d.data().name, createdAt: d.data().createdAt })));
        });
    }, [currentFamily]);

    // 更新綜合動態牆邏輯
    useEffect(() => {
        const selfActs: Activity[] = wishList.map(item => ({ 
            id: `act-s-${item.id}`, type: 'self', itemName: item.name, time: item.createdAt?.toMillis() || Date.now() 
        }));
        const famActs: Activity[] = familyWishList.map(item => ({ 
            id: `act-f-${item.id}`, type: 'family', itemName: item.name, time: item.createdAt?.toMillis() || Date.now() 
        }));

        // 合併：個人心願 + 家庭心願 + 個人/家庭產品(已擁有/預購)
        const allActivities = [...selfActs, ...famActs, ...productActivities]
            .sort((a, b) => b.time - a.time)
            .slice(0, 10); // 取前 10 筆

        setActivities(allActivities);
    }, [wishList, familyWishList, productActivities]);

    const handleAddItem = async () => {
        const name = newItemName.trim();
        if (!name) return;
        setModalVisible(false);
        try {
            const isFamily = mode === 'family';
            const coll = isFamily ? 'family_wishlist' : 'wishlist';
            const data: any = { name, userId: auth.currentUser?.uid, createdAt: serverTimestamp() };
            if (isFamily && currentFamily) data.familyId = currentFamily.id;
            await addDoc(collection(db, coll), data);
            setNewItemName('');
        } catch (e) { console.error(e); }
    };

    // 取得動態標籤樣式
    const getTagConfig = (type: string) => {
        switch(type) {
            case 'self': return { label: '個人心願', color: Colors.primary };
            case 'family': return { label: '家庭需購', color: Colors.familyAccent };
            case 'owned': return { label: '新入手', color: Colors.selfAccent };
            case 'preorder': return { label: '新預購', color: Colors.preorderAccent };
            default: return { label: '更新', color: Colors.subText };
        }
    };

    if (!fontsLoaded || !isDataInitialized) return (
        <View style={{flex:1, justifyContent:'center', backgroundColor:Colors.bg}}>
            <ActivityIndicator size="large" color={Colors.primary}/>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: Colors.bg }]}>
            {/* Tab Header */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={[styles.tabContainer, { backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9' }]}>
                    <Animated.View style={[styles.slidingIndicator, { backgroundColor: Colors.card, transform: [{ translateX: scrollX }] }]} />
                    <TouchableOpacity style={styles.tabButton} onPress={() => switchMode('self')}>
                        <Text style={[styles.tabText, { color: mode === 'self' ? Colors.primary : Colors.subText, fontWeight: mode === 'self' ? 'bold' : 'normal' }]}>個人</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabButton} onPress={() => switchMode('family')}>
                        <Text style={[styles.tabText, { color: mode === 'family' ? Colors.familyAccent : Colors.subText, fontWeight: mode === 'family' ? 'bold' : 'normal' }]}>家庭</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                {/* 動態牆 - 現在包含 SelfList 的同步內容 */}
                <View style={styles.activitySection}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="flash" size={18} color="#FFD700" />
                        <Text style={[styles.smallLabel, { color: Colors.text }]}> 最新動態同步</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20 }}>
                        <AnimatePresence>
                            {activities.map(act => {
                                const config = getTagConfig(act.type);
                                return (
                                    <MotiView 
                                        key={act.id} 
                                        from={{ opacity: 0, scale: 0.9 }} 
                                        animate={{ opacity: 1, scale: 1 }} 
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        style={[styles.activityCard, { backgroundColor: Colors.card, borderLeftColor: config.color }]}
                                    >
                                        <View style={[styles.actTag, { backgroundColor: config.color + '20' }]}>
                                            <Text style={[styles.actTagText, { color: config.color }]}>{config.label}</Text>
                                        </View>
                                        <Text style={[styles.actItemName, { color: Colors.text }]} numberOfLines={1}>{act.itemName}</Text>
                                        <Text style={styles.timeText}>{new Date(act.time).toLocaleDateString()}</Text>
                                    </MotiView>
                                );
                            })}
                        </AnimatePresence>
                    </ScrollView>
                </View>

                {/* 主內容區 */}
                <View style={styles.mainPadding}>
                    {mode === 'self' ? (
                        <MotiView key="self-content" from={{ opacity: 0, translateX: -20 }} animate={{ opacity: 1, translateX: 0 }}>
                            <View style={[styles.mainCard, { backgroundColor: Colors.card }]}>
                                <View style={styles.cardHeader}>
                                    <Text style={[styles.cardTitle, { color: Colors.text }]}>我的心願單 🛒</Text>
                                    <TouchableOpacity onPress={() => setModalVisible(true)}>
                                        <Ionicons name="add-circle" size={42} color={Colors.primary} />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.wishGrid}>
                                    {wishList.map(item => (
                                        <MotiView key={item.id} from={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} style={[styles.wishBubble, { backgroundColor: isDarkMode ? '#2C3E50' : '#F1F5F9' }]}>
                                            <Text style={[styles.itemText, { color: Colors.text }]}>{item.name}</Text>
                                            <TouchableOpacity onPress={() => deleteDoc(doc(db, 'wishlist', item.id))} style={{marginLeft: 8}}>
                                                <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                                            </TouchableOpacity>
                                        </MotiView>
                                    ))}
                                </View>
                            </View>
                        </MotiView>
                    ) : (
                        <MotiView key="family-content" from={{ opacity: 0, translateX: 20 }} animate={{ opacity: 1, translateX: 0 }}>
                            {currentFamily && (
                                <View style={[styles.familyInfoBar, { backgroundColor: Colors.card }]}>
                                    <Text style={[styles.familyBarTitle, { color: Colors.text }]}>{currentFamily.name}</Text>
                                    <TouchableOpacity onPress={() => Share.share({ message: `我的家庭邀請碼：${currentFamily.inviteCode}` })}>
                                        <Ionicons name="share-social" size={24} color={Colors.familyAccent} />
                                    </TouchableOpacity>
                                </View>
                            )}
                            <View style={[styles.mainCard, { backgroundColor: Colors.card }]}>
                                <View style={styles.cardHeader}>
                                    <Text style={[styles.cardTitle, { color: Colors.text }]}>家庭需購 🏠</Text>
                                    <TouchableOpacity onPress={() => setModalVisible(true)}>
                                        <Ionicons name="add-circle" size={42} color={Colors.familyAccent} />
                                    </TouchableOpacity>
                                </View>
                                {familyWishList.map(item => (
                                    <MotiView key={item.id} from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} style={[styles.familyItemRow, { backgroundColor: isDarkMode ? '#2C3E50' : '#F8FAFC' }]}>
                                        <TouchableOpacity onPress={() => deleteDoc(doc(db, 'family_wishlist', item.id))}>
                                            <Ionicons name="checkmark-circle" size={28} color="#10B981" />
                                        </TouchableOpacity>
                                        <Text style={[styles.itemText, { color: Colors.text, flex: 1, marginLeft: 12 }]}>{item.name}</Text>
                                    </MotiView>
                                ))}
                            </View>
                        </MotiView>
                    )}
                </View>
            </ScrollView>

            {/* 新增 Modal */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: Colors.card }]}>
                        <Text style={[styles.cardTitle, { color: Colors.text, textAlign: 'center', marginBottom: 20 }]}>想加入什麼？</Text>
                        <TextInput 
                            style={[styles.input, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F1F5F9', color: Colors.text }]}
                            placeholder="輸入物品名稱..."
                            placeholderTextColor={Colors.subText}
                            value={newItemName}
                            onChangeText={setNewItemName}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 15 }}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#94A3B8' }]} onPress={() => setModalVisible(false)}>
                                <Text style={styles.btnText}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: mode === 'self' ? Colors.primary : Colors.familyAccent }]} onPress={handleAddItem}>
                                <Text style={styles.btnText}>加入</Text>
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
    header: { paddingHorizontal: 20, marginBottom: 10 },
    tabContainer: { flexDirection: 'row', height: 48, borderRadius: 24, padding: 4 },
    tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    tabText: { fontSize: 15, fontFamily: 'ZenKurenaido' },
    slidingIndicator: { position: 'absolute', width: '48%', height: '84%', top: '8%', left: 4, borderRadius: 20, elevation: 3 },
    activitySection: { marginVertical: 10 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, marginBottom: 12 },
    smallLabel: { fontSize: 14, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
    activityCard: { width: 150, padding: 15, borderRadius: 22, marginRight: 12, borderLeftWidth: 5, elevation: 5 },
    actTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 8 },
    actTagText: { fontSize: 10, fontWeight: 'bold' },
    actItemName: { fontSize: 16, fontFamily: 'ZenKurenaido', fontWeight: '600' },
    timeText: { fontSize: 10, color: '#94A3B8', marginTop: 4 },
    mainPadding: { paddingHorizontal: 20 },
    mainCard: { borderRadius: 35, padding: 25, minHeight: 150, elevation: 10 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    cardTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
    wishGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    wishBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, marginRight: 10, marginBottom: 10 },
    itemText: { fontSize: 17, fontFamily: 'ZenKurenaido' },
    familyInfoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderRadius: 25, marginBottom: 15, elevation: 5 },
    familyBarTitle: { fontSize: 18, fontWeight: 'bold', fontFamily: 'ZenKurenaido' },
    familyItemRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    modalCard: { width: '85%', padding: 25, borderRadius: 30 },
    input: { borderRadius: 15, padding: 15, fontSize: 18, marginBottom: 20, fontFamily: 'ZenKurenaido' },
    modalBtn: { flex: 1, padding: 15, borderRadius: 15, alignItems: 'center' },
    btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});