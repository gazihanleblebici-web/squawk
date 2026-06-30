import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen({ onLogin }) {
  const [sicil, setSicil] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!sicil || !password) {
      setError('Sicil numarası ve şifre giriniz.');
      return;
    }
    setLoading(true);
    setError('');

    const { data, error: err } = await supabase
      .from('users')
      .select('*')
      .eq('sicil_no', sicil)
      .eq('password', password)
      .single();

    setLoading(false);

    if (err || !data) {
      setError('Sicil numarası veya şifre hatalı.');
      return;
    }

    onLogin(data);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>✈ SQUAWK</Text>
        <Text style={styles.sub}>ATC Scheduler</Text>
        <Text style={styles.sub2}>LTAI · Antalya Approach</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Sicil Numarası</Text>
          <TextInput
            style={styles.input}
            placeholder="Sicil No"
            placeholderTextColor="#4a6080"
            value={sicil}
            onChangeText={setSicil}
            keyboardType="numeric"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Şifre</Text>
          <TextInput
            style={styles.input}
            placeholder="Şifre"
            placeholderTextColor="#4a6080"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#1a2744" />
              : <Text style={styles.buttonText}>Giriş Yap</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a2744',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 4,
  },
  sub: {
    fontSize: 16,
    color: '#60a5fa',
    marginTop: 6,
    fontWeight: '600',
  },
  sub2: {
    fontSize: 13,
    color: '#f59e0b',
    marginTop: 4,
    fontWeight: '500',
    marginBottom: 40,
  },
  form: {
    width: '100%',
    maxWidth: 340,
  },
  label: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#0f1e35',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 10,
    padding: 14,
    color: '#ffffff',
    fontSize: 15,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: {
    color: '#1a2744',
    fontSize: 16,
    fontWeight: '800',
  },
});