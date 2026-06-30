import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ScheduleScreen from './screens/ScheduleScreen';
import CrewScreen from './screens/CrewScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function Navigation({ user, onLogout }) {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1a2744' },
          headerTintColor: '#ffffff',
          tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e8eef6' },
          tabBarActiveTintColor: '#1a2744',
          tabBarInactiveTintColor: '#94a3b8',
        }}
      >
        <Tab.Screen
          name="Program"
          component={ScheduleScreen}
          options={{ tabBarLabel: 'Program' }}
        />
        <Tab.Screen
          name="Ekip"
          component={CrewScreen}
          options={{ tabBarLabel: 'Ekip' }}
        />
        <Tab.Screen
          name="İstatistik"
          component={StatsScreen}
          options={{ tabBarLabel: 'İstatistik' }}
        />
        <Tab.Screen
          name="Ayarlar"
          component={SettingsScreen}
          options={{ tabBarLabel: 'Ayarlar' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}