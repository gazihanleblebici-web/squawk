import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import ScheduleScreen from './screens/ScheduleScreen';
import CrewScreen from './screens/CrewScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';
import LeaveScreen from './screens/LeaveScreen';

const Tab = createBottomTabNavigator();

function TabIcon({ name, color, size }) {
  const icons = {
    users: '👥',
    grid: '📋',
    calendar: '📅',
    chart: '📊',
    settings: '⚙️',
  };
  return <Text style={{ fontSize: size - 4, color }}>{icons[name]}</Text>;
}

export default function Navigation({ user, onLogout }) {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1a2744' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '800' },
          tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e8eef6', height: 60, paddingBottom: 6 },
          tabBarActiveTintColor: '#1a2744',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tab.Screen name="Ekip" options={{ tabBarLabel: 'Ekip', tabBarIcon: ({ color, size }) => <TabIcon name="users" color={color} size={size} /> }}>
          {() => <CrewScreen user={user} />}
        </Tab.Screen>
        <Tab.Screen name="Program" options={{ tabBarLabel: 'Program', tabBarIcon: ({ color, size }) => <TabIcon name="grid" color={color} size={size} /> }}>
          {() => <ScheduleScreen user={user} />}
        </Tab.Screen>
        <Tab.Screen name="Ajanda" options={{ tabBarLabel: 'Ajanda', tabBarIcon: ({ color, size }) => <TabIcon name="calendar" color={color} size={size} /> }}>
          {() => <LeaveScreen user={user} />}
        </Tab.Screen>
        <Tab.Screen name="Istatistik" component={StatsScreen} options={{ tabBarLabel: 'İstatistik', tabBarIcon: ({ color, size }) => <TabIcon name="chart" color={color} size={size} /> }} />
        <Tab.Screen name="Ayarlar" options={{ tabBarLabel: 'Ayarlar', tabBarIcon: ({ color, size }) => <TabIcon name="settings" color={color} size={size} /> }}>
          {() => <SettingsScreen user={user} onLogout={onLogout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
