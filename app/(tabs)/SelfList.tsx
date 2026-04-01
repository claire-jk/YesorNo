import React from 'react';
import { SafeAreaView, StyleSheet, Text, useColorScheme, View } from 'react-native';

export default function Report() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#121212' : '#F8F9FA' }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: isDarkMode ? '#FFFFFF' : '#333333' }]}>
          報表頁面
        </Text>
        <Text style={styles.subtitle}>開發中，敬請期待...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
  subtitle: { fontSize: 16, fontFamily: 'ZenKurenaido', color: '#888', marginTop: 10 },
});