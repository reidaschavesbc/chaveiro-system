import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { showToast } from '../components/AppAlert';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !senha.trim()) {
      showToast('Preencha usuário e senha', 'warning');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/login', { email: email.trim(), senha });
      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('funcionario', JSON.stringify(data.funcionario));
      onLogin(data.funcionario);
    } catch (e) {
      showToast(e.response?.data?.error || 'Não foi possível conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.card}>
        <Text style={s.logo}>🔑</Text>
        <Text style={s.title}>Sistema Chaveiro</Text>
        <Text style={s.sub}>Área do Funcionário</Text>

        <TextInput
          style={s.input}
          placeholder="Usuário"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          placeholder="Senha"
          placeholderTextColor="#999"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
        />

        <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Entrar</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', elevation: 8 },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 4 },
  sub: { fontSize: 14, color: '#666', marginBottom: 28 },
  input: {
    width: '100%', borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#333',
    marginBottom: 14, backgroundColor: '#f9f9f9'
  },
  btn: {
    width: '100%', backgroundColor: '#2563eb', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 6
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
