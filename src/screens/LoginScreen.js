import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen({ onLogin }) {
  const [sicil, setSicil] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [airports, setAirports] = useState([]);
  const [selectedIcao, setSelectedIcao] = useState(null);
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [step, setStep] = useState('login'); // 'login' | 'icao' | 'unit'
  const [pendingUser, setPendingUser] = useState(null);

  useEffect(() => {
    fetchAirports();
  }, []);

  async function fetchAirports() {
    const { data } = await supabase
      .from('airports')
      .select('*')
      .order('icao_code', { ascending: true });
    if (data) setAirports(data);
  }

  const icaoCodes = [...new Set(airports.map(a => a.icao_code))];
  const unitsForIcao = airports.filter(a => a.icao_code === selectedIcao);

  async function handleLogin() {
    if (!sicil || !password) { setError('Sicil ve sifre giriniz.'); return; }
    setLoading(true);
    setError('');

    const { data, error: err } = await supabase
      .from('users')
      .select('*, airports(*)')
      .eq('sicil_no', sicil)
      .eq('password', password)
      .single();

    setLoading(false);

    if (err || !data) {
      setError('Sicil veya sifre hatali.');
      return;
    }

    // Havalimani daha once secilmis mi?
    if (data.airport_id && data.airports) {
      onLogin(data);
    } else {
      // Ilk giris - havalimani sec
      setPendingUser(data);
      setStep('icao');
    }
  }

  async function finishSetup() {
    if (!selectedAirport || !pendingUser) return;
    setLoading(true);

    await supabase
      .from('users')
      .update({ airport_id: selectedAirport.id })
      .eq('id', pendingUser.id);

    setLoading(false);
    onLogin({ ...pendingUser, airport_id: selectedAirport.id, airports: selectedAirport });
  }

  // ADIM: GİRİŞ
  if (step === 'login') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>✈ SQUAWK</Text>
          <Text style={styles.sub}>ATC Scheduler</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Sicil Numarasi</Text>
            <TextInput
              style={styles.input}
              placeholder="Sicil No"
              placeholderTextColor="#4a6080"
              value={sicil}
              onChangeText={setSicil}
              keyboardType="numeric"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Sifre</Text>
            <TextInput
              style={styles.input}
              placeholder="Sifre"
              placeholderTextColor="#4a6080"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#1a2744" />
                : <Text style={styles.buttonText}>Giris Yap</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ADIM: ICAO SEÇ
  if (step === 'icao') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>✈ SQUAWK</Text>
          <Text style={styles.sub}>Ilk kurulum</Text>

          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, styles.stepDotActive]}><Text style={styles.stepDotNumActive}>1</Text></View>
            <View style={styles.stepLine} />
            <View style={styles.stepDot}><Text style={styles.stepDotNum}>2</Text></View>
          </View>
          <View style={styles.stepLabelRow}>
            <Text style={styles.stepLabelText}>Havalimani</Text>
            <Text style={styles.stepLabelText}>Birim</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Havalimaninizi secin</Text>
            <Text style={styles.formSub}>Calistığınız havalimani ICAO koduna tiklayin</Text>
            <View style={styles.icaoGrid}>
              {icaoCodes.map(icao => (
                <TouchableOpacity
                  key={icao}
                  style={[styles.icaoBtn, selectedIcao === icao && styles.icaoBtnActive]}
                  onPress={() => { setSelectedIcao(icao); setSelectedAirport(null); }}
                >
                  <Text style={[styles.icaoBtnText, selectedIcao === icao && styles.icaoBtnTextActive]}>
                    {icao}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, !selectedIcao && styles.buttonDisabled]}
              onPress={() => {
                if (!selectedIcao) { setError('Havalimani secin.'); return; }
                setError('');
                setStep('unit');
              }}
            >
              <Text style={styles.buttonText}>Devam →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ADIM: BİRİM SEÇ
  if (step === 'unit') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>✈ SQUAWK</Text>
          <Text style={styles.sub}>Ilk kurulum</Text>

          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, styles.stepDotDone]}><Text style={styles.stepDotNumActive}>✓</Text></View>
            <View style={[styles.stepLine, styles.stepLineActive]} />
            <View style={[styles.stepDot, styles.stepDotActive]}><Text style={styles.stepDotNumActive}>2</Text></View>
          </View>
          <View style={styles.stepLabelRow}>
            <Text style={styles.stepLabelText}>Havalimani</Text>
            <Text style={styles.stepLabelText}>Birim</Text>
          </View>

          <View style={styles.form}>
            <TouchableOpacity onPress={() => setStep('icao')} style={styles.breadcrumb}>
              <Text style={styles.breadcrumbText}>← {selectedIcao}</Text>
            </TouchableOpacity>

            <Text style={styles.formTitle}>Birimi secin</Text>
            <Text style={styles.formSub}>{airports.find(a => a.icao_code === selectedIcao)?.name}</Text>

            <View style={styles.unitGrid}>
              {unitsForIcao.map(ap => (
                <TouchableOpacity
                  key={ap.id}
                  style={[styles.unitBtn, selectedAirport?.id === ap.id && styles.unitBtnActive]}
                  onPress={() => setSelectedAirport(ap)}
                >
                  <Text style={[styles.unitBtnText, selectedAirport?.id === ap.id && styles.unitBtnTextActive]}>
                    {ap.unit_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, !selectedAirport && styles.buttonDisabled]}
              onPress={() => {
                if (!selectedAirport) { setError('Birim secin.'); return; }
                setError('');
                finishSetup();
              }}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#1a2744" />
                : <Text style={styles.buttonText}>Baslayalim →</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a2744' },
  inner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingBottom: 48 },
  logo: { fontSize: 42, fontWeight: '800', color: '#ffffff', letterSpacing: 4 },
  sub: { fontSize: 16, color: '#60a5fa', marginTop: 6, fontWeight: '600', marginBottom: 32 },
  form: { width: '100%', maxWidth: 380 },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginBottom: 4 },
  formSub: { fontSize: 12, color: '#64748b', marginBottom: 20 },
  label: { color: '#93c5fd', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#0f1e35', borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 10, padding: 14, color: '#ffffff', fontSize: 15 },
  error: { color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' },
  button: { backgroundColor: '#f59e0b', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#1a2744', fontSize: 16, fontWeight: '800' },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0f1e35', borderWidth: 2, borderColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  stepDotDone: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  stepDotNum: { fontSize: 13, fontWeight: '800', color: '#4a6080' },
  stepDotNumActive: { fontSize: 13, fontWeight: '800', color: '#1a2744' },
  stepLine: { width: 60, height: 2, backgroundColor: '#1e3a5f', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: '#f59e0b' },
  stepLabelRow: { flexDirection: 'row', justifyContent: 'space-between', width: 152, marginBottom: 28 },
  stepLabelText: { fontSize: 10, color: '#4a6080', fontWeight: '600', textAlign: 'center', width: 60 },
  breadcrumb: { marginBottom: 12 },
  breadcrumbText: { fontSize: 13, color: '#f59e0b', fontWeight: '700' },
  icaoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  icaoBtn: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: '#0f1e35', borderWidth: 1.5, borderColor: '#1e3a5f', minWidth: 80, alignItems: 'center' },
  icaoBtnActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  icaoBtnText: { fontSize: 14, fontWeight: '800', color: '#60a5fa', letterSpacing: 1 },
  icaoBtnTextActive: { color: '#1a2744' },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  unitBtn: { flex: 1, paddingVertical: 24, borderRadius: 12, backgroundColor: '#0f1e35', borderWidth: 1.5, borderColor: '#1e3a5f', alignItems: 'center', minWidth: 100 },
  unitBtnActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  unitBtnText: { fontSize: 18, fontWeight: '800', color: '#60a5fa' },
  unitBtnTextActive: { color: '#1a2744' },
});