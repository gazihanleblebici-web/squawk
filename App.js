import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) {
    return (
      <>
        <LoginScreen onLogin={setUser} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>✈ SQUAWK</Text>
      <Text style={styles.welcome}>Hoş geldin, {user.full_name}!</Text>
      <Text style={styles.role}>
        {user.role === 'chief' ? '👑 Ekip Şefi' : 
         user.is_ojti ? '🎓 OJTI' : '✅ Rate\'li ATC'}
      </Text>
      <Text style={styles.initial}>{user.initial}</Text>
      <TouchableOpacity style={styles.logout} onPress={() => setUser(null)}>
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a2744',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 4,
    marginBottom: 32,
  },
  welcome: {
    fontSize: 20,
    color: '#60a5fa',
    fontWeight: '700',
    textAlign: 'center',
  },
  role: {
    fontSize: 15,
    color: '#f59e0b',
    marginTop: 8,
    fontWeight: '600',
  },
  initial: {
    fontSize: 64,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 24,
    opacity: 0.2,
  },
  logout: {
    marginTop: 48,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 10,
    padding: 14,
    paddingHorizontal: 32,
  },
  logoutText: {
    color: '#4a6080',
    fontSize: 14,
    fontWeight: '600',
  },
});