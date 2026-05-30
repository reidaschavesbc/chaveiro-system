import React, { useState, useEffect, useRef } from 'react';
import { Platform, Linking, TouchableOpacity, Text, View, AppState } from 'react-native';
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
import AppAlert, { alertRef, showConfirm } from './components/AppAlert';
import LoginScreen from './screens/LoginScreen';
import OSListScreen from './screens/OSListScreen';
import OSDetalheScreen from './screens/OSDetalheScreen';
import OSNovaScreen from './screens/OSNovaScreen';
import BuscaScreen from './screens/BuscaScreen';
import AdminScreen from './screens/AdminScreen';
import AfiacaoScreen from './screens/AfiacaoScreen';
import LembretesScreen from './screens/LembretesScreen';
import api, { setOnUnauthorized } from './services/api';

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
  const [atualizacaoObrigatoria, setAtualizacaoObrigatoria] = useState(null);
  const notifListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    setOnUnauthorized(() => setFuncionario(null));
    verificarLogin();
    configurarNotificacoes();
    verificarVersao();

    const intervalo = setInterval(() => verificarVersao(), 5 * 60 * 1000);
    return () => {
      clearInterval(intervalo);
      Notifications.removeNotificationSubscription(notifListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  async function verificarVersao() {
    try {
      const serverUrl = api.defaults.baseURL.replace('/api/app', '');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${serverUrl}/api/apk-version`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) return;
      const { version: versaoServidor } = await resp.json();
      const versaoApp = Constants.default?.expoConfig?.version || Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
      if (versaoServidor && versaoServidor !== versaoApp) {
        setAtualizacaoObrigatoria({ versaoServidor, serverUrl });
      } else {
        setAtualizacaoObrigatoria(null);
      }
    } catch (_) {}
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

  if (atualizacaoObrigatoria) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 64, marginBottom: 24 }}>🔑</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8, textAlign: 'center' }}>Atualização obrigatória</Text>
          <Text style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', marginBottom: 8 }}>
            Versão disponível: <Text style={{ color: '#fff', fontWeight: '700' }}>{atualizacaoObrigatoria.versaoServidor}</Text>
          </Text>
          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 36 }}>
            Para continuar usando o sistema, atualize o app.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`${atualizacaoObrigatoria.serverUrl}/download-app`)}
            style={{ backgroundColor: '#2563eb', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Baixar atualização</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={verificarVersao} style={{ marginTop: 16, padding: 12 }}>
            <Text style={{ color: '#475569', fontSize: 13 }}>Verificar novamente</Text>
          </TouchableOpacity>
        </View>
        <AppAlert ref={alertRef} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
    <NavigationContainer>
      {funcionario ? (
        funcionario.perfil === 'afiador' ? (
          <Stack.Navigator>
            <Stack.Screen
              name="Afiacao"
              options={{
                title: '✂️ Afiação',
                headerTintColor: '#6366f1',
                headerRight: () => (
                  <TouchableOpacity
                    onPress={handleLogout}
                    style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffffff22', borderRadius: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: '#6366f1', fontWeight: '700' }}>SAIR</Text>
                  </TouchableOpacity>
                ),
              }}
            >
              {props => <AfiacaoScreen {...props} isAfiador={true} />}
            </Stack.Screen>
          </Stack.Navigator>
        ) : (
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
            name="Afiacao"
            component={AfiacaoScreen}
            options={{ title: '✂️ Afiação', headerBackTitle: 'Voltar', headerTintColor: '#6366f1' }}
          />
          <Stack.Screen
            name="Lembretes"
            component={LembretesScreen}
            options={{
              title: '🔔 Lembretes',
              headerBackVisible: false,
              headerLeft: () => null,
              headerTintColor: '#1a1a2e',
              headerStyle: { backgroundColor: '#f59e0b' },
              headerTitleStyle: { color: '#1a1a2e', fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Admin"
            component={AdminScreen}
            options={({ navigation }) => ({
              title: '👑 ADM',
              headerBackVisible: false,
              headerTintColor: '#fff',
              headerStyle: { backgroundColor: '#7c3aed' },
              headerTitleStyle: { color: '#fff', fontWeight: 'bold' },
              headerLeft: () => null,
              headerRight: () => (
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffffff22', borderRadius: 8 }}
                >
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}>VOLTAR</Text>
                </TouchableOpacity>
              ),
            })}
          />
        </Stack.Navigator>
        )
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
    </NavigationContainer>
    <AppAlert ref={alertRef} />
    </SafeAreaProvider>
  );
}
