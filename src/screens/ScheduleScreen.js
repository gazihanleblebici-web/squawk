import { View, Text, StyleSheet } from 'react-native';

export default function ScheduleScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>📅 Program</Text>
      <Text style={styles.sub}>Yakında burada olacak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a2744', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, color: '#ffffff', fontWeight: '800' },
  sub: { fontSize: 14, color: '#60a5fa', marginTop: 8 },
});
