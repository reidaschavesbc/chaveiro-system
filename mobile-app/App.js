import React, { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('chaveiro_alerts', {
    name: 'Alertas Chaveiro',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    enableVibrate: true,
  });
}

import LoginScreen from './screens/LoginScreen';
import OSListScreen from './screens/OSListScreen';
import OSDetalheScreen from './screens/OSDetalheScreen';
import api from './services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const Stack = createNativeStackNavigator();

export default function App() {
  const [funcionario, setFuncionario] = useState(null);
  const [loading, setLoading] = useState(true);
  const notifListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    verificarLogin();
    configurarNotificacoes();
    return () => {
      Notifications.removeNotificationSubscription(notifListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  async function verificarLogin() {
    const token = await AsyncStorage.getItem('token');
    const f = await AsyncStorage.getItem('funcionario');
    if (token && f) {
      setFuncionario(JSON.parse(f));
    }
    setLoading(false);
  }

  async function configurarNotificacoes() {
    if (!Device.isDevice) return;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    try {
      const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();
      const savedToken = await AsyncStorage.getItem('push_token');
      if (fcmToken !== savedToken) {
        await api.post('/push-token', { token: fcmToken });
        await AsyncStorage.setItem('push_token', fcmToken);
      }
    } catch (e) {
      console.error('Erro ao obter FCM token:', e.message);
    }

    notifListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});
  }

  async function handleLogin(func) {
    setFuncionario(func);
    await configurarNotificacoes();
  }

  async function handleLogout() {
    await AsyncStorage.multiRemove(['token', 'funcionario', 'push_token']);
    setFuncionario(null);
  }

  if (loading) return null;

  return (
    <NavigationContainer>
      {funcionario ? (
        <Stack.Navigator>
          <Stack.Screen name="OSList" options={{ headerShown: false }}>
            {props => <OSListScreen {...props} onLogout={handleLogout} />}
          </Stack.Screen>
          <Stack.Screen
            name="OSDetalhe"
            component={OSDetalheScreen}
            options={{ title: 'Detalhes da OS', headerBackTitle: 'Voltar', headerTintColor: '#2563eb' }}
          />
        </Stack.Navigator>
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
    </NavigationContainer>
  );
}
