import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ScheduleScreen from './screens/ScheduleScreen';
import CrewScreen from './screens/CrewScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';
import LeaveScreen from './screens/LeaveScreen';

const Tab = createBottomTabNavigator();

export default function Navigation({ user, onLogout }) {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1a2744' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '800' },
          tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e8eef6' },
          tabBarActiveTintColor: '#1a2744',
          tabBarInactiveTintColor: '#94a3b8',
        }}
      >
        <Tab.Screen name="Ekip" options={{ tabBarLabel: 'Ekip' }}>
          {() => <CrewScreen user={user} />}
        </Tab.Screen>
        <Tab.Screen name="Ajanda" options={{ tabBarLabel: 'Ajanda' }}>
          {() => <LeaveScreen user={user} />}
        </Tab.Screen>
        <Tab.Screen name="Program" options={{ tabBarLabel: 'Program' }}>
          {() => <ScheduleScreen user={user} />}
        </Tab.Screen>
        <Tab.Screen name="Istatistik" component={StatsScreen} options={{ tabBarLabel: 'İstatistik' }} />
        <Tab.Screen name="Ayarlar" options={{ tabBarLabel: 'Ayarlar' }}>
          {() => <SettingsScreen user={user} onLogout={onLogout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
