import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import Navigation from './src/Navigation';

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
    <>
      <Navigation user={user} onLogout={() => setUser(null)} />
      <StatusBar style="auto" />
    </>
  );
}