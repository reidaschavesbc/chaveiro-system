import React, { useState, useEffect, useRef } from 'react';
import { Platform, Alert, Linking, TouchableOpacity, Text, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Constants from 'expo-constants';

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('chaveiro_alerts', {
    name: 'Alertas Chaveiro',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    enableVibrate: true,
  });
}

import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './screens/LoginScreen';
import OSListScreen from './screens/OSListScreen';
import OSDetalheScreen from './screens/OSDetalheScreen';
import OSNovaScreen from './screens/OSNovaScreen';
import BuscaScreen from './screens/BuscaScreen';
import AdminScreen from './screens/AdminScreen';
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
    verificarAtualizacao();

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') verificarAtualizacao();
    });

    return () => {
      sub.remove();
      Notifications.removeNotificationSubscription(notifListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  async function verificarAtualizacao() {
    try {
      const serverUrl = api.defaults.baseURL.replace('/api/app', '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${serverUrl}/api/apk-version`, { signal: controller.signal });
      clearTimeout(timer);
      const { version: versaoServidor } = await resp.json();
      const versaoApp = Constants.default?.expoConfig?.version || Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
      if (versaoServidor && versaoServidor !== versaoApp) {
        Alert.alert(
          'Atualização disponível',
          `Nova versão ${versaoServidor} disponível. Deseja atualizar agora?`,
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Atualizar', onPress: () => Linking.openURL(`${serverUrl}/download-app`) },
          ]
        );
      }
    } catch (e) {
      console.warn('verificarAtualizacao:', e.message);
    }
  }

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
    <SafeAreaProvider>
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
          <Stack.Screen
            name="OSNova"
            component={OSNovaScreen}
            options={{ title: 'Nova OS', headerBackTitle: 'Voltar', headerTintColor: '#2563eb' }}
          />
          <Stack.Screen
            name="Busca"
            component={BuscaScreen}
            options={{ title: '🔍 Consulta de Preços', headerBackTitle: 'Voltar', headerTintColor: '#2563eb' }}
          />
          <Stack.Screen
            name="Admin"
            component={AdminScreen}
            options={({ navigation }) => ({
              title: '👑 ADM',
              headerBackVisible: false,
              headerTintColor: '#7c3aed',
              headerLeft: () => null,
              headerRight: () => (
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffffff22', borderRadius: 8 }}
                >
                  <Text style={{ fontSize: 13, color: '#7c3aed', fontWeight: '700' }}>VOLTAR</Text>
                </TouchableOpacity>
              ),
            })}
          />
        </Stack.Navigator>
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
    </NavigationContainer>
    </SafeAreaProvider>
  );
}
