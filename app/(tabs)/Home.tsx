import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    LayoutAnimation,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
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
    limit,
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
    type: 'self' | 'family';
    itemName: string;
    time: number;
}

export default function Home() {
    let [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });

    const [mode, setMode] = useState<'self' | 'family'>('self');
    const [wishList, setWishList] = useState<WishItem[]>([]);
    const [familyWishList, setFamilyWishList] = useState<WishItem[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]); 
    const [families, setFamilies] = useState<Family[]>([]);
    const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [isDataInitialized, setIsDataInitialized] = useState(false);
    const isInitialMount = useRef(true);

    const [modalVisible, setModalVisible] = useState(false);
    const [familyModalVisible, setFamilyModalVisible] = useState(false);
    const [createJoinModalVisible, setCreateJoinModalVisible] = useState(false);
    const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', type: 'success' as 'success' | 'error' });
    const [confirmConfig, setConfirmConfig] = useState({ visible: false, title: '', message: '', onConfirm: () => {} });

    const [newItemName, setNewItemName] = useState('');
    const [familyAction, setFamilyAction] = useState<'create' | 'join' | null>(null);
    const [inputVal, setInputVal] = useState('');

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
        inputBg: isDarkMode ? '#2C2C2C' : '#F1F5F9',
        itemBg: isDarkMode ? '#252525' : '#F8FAFC',
    };

    const switchMode = (target: 'self' | 'family') => {
        setMode(target);
        Animated.spring(scrollX, {
            toValue: target === 'self' ? 0 : width / 2 - 24,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const showAlert = (title: string, message: string, type: 'success' | 'error' = 'success') => setCustomAlert({ visible: true, title, message, type });
    const showConfirm = (title: string, message: string, onConfirm: () => void) => setConfirmConfig({ visible: true, title, message, onConfirm });

    // 監聽 Auth & 家庭成員
    useEffect(() => {
        let unsubSelf: (() => void) | undefined;
        let unsubFamMembers: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (!user) { setLoading(false); setIsDataInitialized(true); return; }

            const qSelf = query(collection(db, 'wishlist'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
            unsubSelf = onSnapshot(qSelf, (snap) => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setWishList(snap.docs.map(d => ({ id: d.id, name: d.data().name, createdAt: d.data().createdAt })));
            });

            const qFamMember = query(collection(db, 'family_members'), where('userId', '==', user.uid));
            unsubFamMembers = onSnapshot(qFamMember, async (snap) => {
                if (snap.empty) { setFamilies([]); setLoading(false); setIsDataInitialized(true); return; }
                
                const famIds = Array.from(new Set(snap.docs.map(d => d.data().familyId))); // 預先去重
                const famDataList: Family[] = [];
                
                for (const fId of famIds) {
                    const fDoc = await getDocs(query(collection(db, 'families'), where('__name__', '==', fId)));
                    fDoc.forEach(d => famDataList.push({ id: d.id, ...d.data() } as Family));
                }

                const uniqueFamilies = famDataList.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
                setFamilies(uniqueFamilies);

                if (uniqueFamilies.length > 0 && isInitialMount.current) {
                    const savedId = await AsyncStorage.getItem('currentFamilyId');
                    let targetFamily = savedId ? uniqueFamilies.find(f => f.id === savedId) : uniqueFamilies[0];
                    setCurrentFamily(targetFamily || uniqueFamilies[0]);
                    switchMode('family');
                    isInitialMount.current = false;
                }
                setLoading(false);
                setIsDataInitialized(true);
            });
        });
        return () => { unsubscribeAuth(); unsubSelf?.(); unsubFamMembers?.(); };
    }, []);

    useEffect(() => {
        if (!currentFamily) { setFamilyWishList([]); return; }
        const qFamWish = query(collection(db, 'family_wishlist'), where('familyId', '==', currentFamily.id), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(qFamWish, (snap) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setFamilyWishList(snap.docs.map(d => ({ id: d.id, name: d.data().name, createdAt: d.data().createdAt })));
        });
        return () => unsubscribe();
    }, [currentFamily]);

    useEffect(() => {
        const combineActivities = () => {
            const selfActs: Activity[] = wishList.slice(0, 5).map(item => ({
                id: `act-self-${item.id}`, 
                type: 'self',
                itemName: item.name,
                time: item.createdAt?.toMillis() || Date.now()
            }));
            const famActs: Activity[] = familyWishList.slice(0, 5).map(item => ({
                id: `act-family-${item.id}`, 
                type: 'family',
                itemName: item.name,
                time: item.createdAt?.toMillis() || Date.now()
            }));
            const sorted = [...selfActs, ...famActs].sort((a, b) => b.time - a.time).slice(0, 8);
            setActivities(sorted);
        };
        combineActivities();
    }, [wishList, familyWishList]);

    const handleAddItem = async (isFamily = false) => {
        const name = newItemName.trim();
        if (!name) return;
        setModalVisible(false);
        try {
            const coll = isFamily ? 'family_wishlist' : 'wishlist';
            const data: any = { name, userId: auth.currentUser?.uid, createdAt: serverTimestamp() };
            if (isFamily && currentFamily) data.familyId = currentFamily.id;
            await addDoc(collection(db, coll), data);
            setNewItemName('');
        } catch (e) { showAlert('錯誤', '新增失敗', 'error'); }
    };

    const handleFamilyAction = async () => {
        if (!inputVal.trim()) return;
        setCreateJoinModalVisible(false);
        try {
            if (familyAction === 'create') {
                const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                const newFamRef = await addDoc(collection(db, 'families'), { name: inputVal, inviteCode, creatorId: auth.currentUser?.uid, createdAt: serverTimestamp() });
                await addDoc(collection(db, 'family_members'), { familyId: newFamRef.id, userId: auth.currentUser?.uid });
                await AsyncStorage.setItem('currentFamilyId', newFamRef.id);
                setCurrentFamily({ id: newFamRef.id, name: inputVal, inviteCode });
                switchMode('family');
            } else {
                const q = query(collection(db, 'families'), where('inviteCode', '==', inputVal.toUpperCase()), limit(1));
                const snap = await getDocs(q);
                if (snap.empty) { showAlert('失敗', '找不到邀請碼', 'error'); return; }
                const famId = snap.docs[0].id;
                await addDoc(collection(db, 'family_members'), { familyId: famId, userId: auth.currentUser?.uid });
                await AsyncStorage.setItem('currentFamilyId', famId);
                setCurrentFamily({ id: famId, ...snap.docs[0].data() } as Family);
                switchMode('family');
            }
            setInputVal('');
        } catch (e) { showAlert('錯誤', '操作失敗', 'error'); }
    };

    if (!fontsLoaded || !isDataInitialized) return (
        <View style={[styles.container, { backgroundColor: Colors.bg, justifyContent: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
    );

    return (
        <View style={[styles.container, { backgroundColor: Colors.bg }]}>
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
                <View style={styles.activitySection}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="flash" size={18} color="#FFD700" />
                        <Text style={[styles.smallLabel, { color: Colors.text }]}> 最新動態</Text>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20 }}>
                        <AnimatePresence>
                            {activities.map(act => (
                                <MotiView 
                                    key={act.id} 
                                    from={{ opacity: 0, translateY: 20 }} 
                                    animate={{ opacity: 1, translateY: 0 }} 
                                    exit={{ opacity: 0, translateY: -20 }} 
                                    transition={{ type: 'timing', duration: 300 }}
                                    style={[styles.activityCard, { backgroundColor: Colors.card, borderLeftColor: act.type === 'self' ? Colors.selfAccent : Colors.familyAccent }]}
                                >
                                    <View style={[styles.actTag, { backgroundColor: act.type === 'self' ? Colors.selfAccent + '20' : Colors.familyAccent + '20' }]}>
                                        <Text style={[styles.actTagText, { color: act.type === 'self' ? Colors.selfAccent : Colors.familyAccent }]}>{act.type === 'self' ? '個人' : '家庭'}</Text>
                                    </View>
                                    <Text style={[styles.actItemName, { color: Colors.text }]} numberOfLines={1}>{act.itemName}</Text>
                                </MotiView>
                            ))}
                        </AnimatePresence>
                    </ScrollView>
                </View>

                <View style={styles.mainPadding}>
                    <AnimatePresence>
                        {mode === 'self' ? (
                            <MotiView 
                                from={{ opacity: 0, translateX: -30 }} 
                                animate={{ opacity: 1, translateX: 0 }} 
                                exit={{ opacity: 0, translateX: -30 }} 
                                transition={{ type: 'timing', duration: 350 }}
                            >
                                <View style={[styles.mainCard, { backgroundColor: Colors.card }]}>
                                    <View style={styles.cardHeader}>
                                        <Text style={[styles.cardTitle, { color: Colors.text }]}>我的購買清單 🛒</Text>
                                        <TouchableOpacity onPress={() => setModalVisible(true)}><Ionicons name="add-circle" size={42} color={Colors.primary} /></TouchableOpacity>
                                    </View>
                                    <View style={styles.wishGrid}>
                                        {wishList.map(item => (
                                            <MotiView 
                                                key={`list-self-${item.id}`} 
                                                from={{ opacity: 0, scale: 0.8 }} 
                                                animate={{ opacity: 1, scale: 1 }} 
                                                exit={{ opacity: 0, scale: 0.8 }} 
                                                transition={{ type: 'spring', damping: 10, stiffness: 90 }}
                                                style={[styles.wishBubble, { backgroundColor: Colors.itemBg }]}
                                            >
                                                <Text style={[styles.itemText, { color: Colors.text }]}>{item.name}</Text>
                                                <TouchableOpacity onPress={() => showConfirm("移除", `確定移除「${item.name}」？`, () => deleteDoc(doc(db, 'wishlist', item.id)))}><Ionicons name="close-circle" size={18} color="#CBD5E1" /></TouchableOpacity>
                                            </MotiView>
                                        ))}
                                    </View>
                                </View>
                            </MotiView>
                        ) : (
                            currentFamily && (
                                <MotiView from={{ opacity: 0, translateX: 30 }} animate={{ opacity: 1, translateX: 0 }} exit={{ opacity: 0, translateX: 30 }} transition={{ type: 'timing', duration: 350 }}>
                                    <View>
                                        <View style={[styles.familyInfoBar, { backgroundColor: Colors.card }]}>
                                            <TouchableOpacity onPress={() => setFamilyModalVisible(true)} style={styles.familySelectorBtn}>
                                                <Text style={[styles.familyBarTitle, { color: Colors.text }]}>{currentFamily.name} <Ionicons name="chevron-down" size={14} /></Text>
                                                <Text style={styles.inviteCodeText}>代碼: {currentFamily.inviteCode}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => Share.share({ message: `來加入我的家庭「${currentFamily.name}」！邀請碼：${currentFamily.inviteCode}` })}><Ionicons name="share-social" size={24} color={Colors.familyAccent} /></TouchableOpacity>
                                        </View>
                                        <View style={[styles.mainCard, { backgroundColor: Colors.card }]}>
                                            <View style={styles.cardHeader}>
                                                <Text style={[styles.cardTitle, { color: Colors.text }]}>家庭需購 🏠</Text>
                                                <TouchableOpacity onPress={() => setModalVisible(true)}><Ionicons name="add-circle" size={42} color={Colors.familyAccent} /></TouchableOpacity>
                                            </View>
                                            <AnimatePresence>
                                                {familyWishList.map(item => (
                                                    <MotiView
                                                        key={`list-fam-${item.id}`}
                                                        from={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                        transition={{ type: 'spring', damping: 10, stiffness: 90 }}
                                                        style={[styles.familyItemRow, { backgroundColor: Colors.itemBg }]}
                                                    >
                                                        <TouchableOpacity onPress={() => showConfirm("完成", `確定已買好「${item.name}」？`, () => deleteDoc(doc(db, 'family_wishlist', item.id)))}><Ionicons name="checkmark-circle" size={28} color="#10B981" /></TouchableOpacity>
                                                        <Text style={[styles.itemText, { color: Colors.text, flex: 1, marginLeft: 12 }]}>{item.name}</Text>
                                                        <TouchableOpacity onPress={() => deleteDoc(doc(db, 'family_wishlist', item.id))}><Ionicons name="trash-outline" size={20} color={Colors.subText} /></TouchableOpacity>
                                                    </MotiView>
                                                ))}
                                            </AnimatePresence>
                                        </View>
                                    </View>
                                </MotiView>
                            )
                        )}
                    </AnimatePresence>
                </View>
            </ScrollView>

            {/* 家庭選單 Drawer 與其他 Modal 可以同樣加入 Moti 動畫 */}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, marginBottom: 10 },
    tabContainer: { flexDirection: 'row', height: 48, borderRadius: 24, padding: 4, position: 'relative' },
    tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    tabText: { fontSize: 15, fontFamily: 'ZenKurenaido' },
    slidingIndicator: { position: 'absolute', width: '48%', height: '84%', top: '8%', borderRadius: 20, elevation: 3, shadowOpacity: 0.1 },
    activitySection: { marginVertical: 10 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, marginBottom: 12 },
    smallLabel: { fontSize: 14, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
    activityCard: { width: 140, padding: 15, borderRadius: 22, marginRight: 12, borderLeftWidth: 5, elevation: 5, shadowOpacity: 0.08 },
    actTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 8 },
    actTagText: { fontSize: 10, fontWeight: 'bold' },
    actItemName: { fontSize: 16, fontFamily: 'ZenKurenaido', fontWeight: '600' },
    mainPadding: { paddingHorizontal: 20 },
    mainCard: { borderRadius: 35, padding: 25, minHeight: 150, elevation: 10 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    cardTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
    wishGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    wishBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, marginRight: 10, marginBottom: 10 },
    itemText: { fontSize: 17, fontFamily: 'ZenKurenaido' },
    familyInfoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderRadius: 25, marginBottom: 15, elevation: 5 },
    familySelectorBtn: { flex: 1 },
    familyBarTitle: { fontSize: 18, fontWeight: 'bold', fontFamily: 'ZenKurenaido' },
    inviteCodeText: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
    familyItemRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 10 },
    btnRow: { flexDirection: 'row', marginTop: 25, gap: 15 },
});