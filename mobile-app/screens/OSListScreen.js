import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, AppState
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const STATUS_LABEL = {
  aberta: { label: 'Aberta', color: '#f59e0b' },
  em_andamento: { label: 'Em andamento', color: '#3b82f6' },
  concluida: { label: 'Concluída', color: '#10b981' },
  cancelada: { label: 'Cancelada', color: '#ef4444' },
};

function fmtData(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, m, dia] = s.split('-');
  return `${dia}/${m}/${y}`;
}

function fmtVal(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function OSListScreen({ navigation, onLogout }) {
  const [os, setOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState('abertas');
  const [funcionario, setFuncionario] = useState(null);
  const intervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  useFocusEffect(useCallback(() => {
    carregarFuncionario();
    carregarOS();

    intervalRef.current = setInterval(() => {
      if (appStateRef.current === 'active') carregarOS();
    }, 30000);

    const sub = AppState.addEventListener('change', state => { appStateRef.current = state; });

    return () => {
      clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [filtro]));

  async function carregarFuncionario() {
    const f = await AsyncStorage.getItem('funcionario');
    if (f) setFuncionario(JSON.parse(f));
  }

  async function carregarOS() {
    try {
      const params = filtro === 'abertas' ? {} : { status: filtro };
      const { data } = await api.get('/os', { params });
      setOs(data);
    } catch (e) {
      if (e.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function renderOS({ item }) {
    const st = STATUS_LABEL[item.status] || { label: item.status, color: '#666' };
    return (
      <TouchableOpacity style={s.card} onPress={() => navigation.navigate('OSDetalhe', { osId: item.id })}>
        <View style={s.cardTop}>
          <Text style={s.numero}>{item.numero}</Text>
          <View style={[s.badge, { backgroundColor: st.color + '22' }]}>
            <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <Text style={s.cliente}>{item.cliente_nome}</Text>
        <Text style={s.descricao} numberOfLines={2}>{item.descricao}</Text>
        <View style={s.cardBottom}>
          <Text style={s.valor}>{fmtVal(item.valor)}</Text>
          {item.data_prevista ? <Text style={s.data}>Previsto: {fmtData(item.data_prevista)}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Minhas OS</Text>
          {funcionario && <Text style={s.headerSub}>Olá, {funcionario.nome.split(' ')[0]}!</Text>}
        </View>
        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      <View style={s.filtros}>
        {['abertas', 'concluida', 'cancelada'].map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filtroBtn, filtro === f && s.filtroBtnAtivo]}
            onPress={() => { setFiltro(f); setLoading(true); }}
          >
            <Text style={[s.filtroText, filtro === f && s.filtroTextAtivo]}>
              {f === 'abertas' ? 'Abertas' : f === 'concluida' ? 'Concluídas' : 'Canceladas'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
      ) : (
        <FlatList
          data={os}
          keyExtractor={i => String(i.id)}
          renderItem={renderOS}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregarOS(); }} />}
          ListEmptyComponent={<Text style={s.vazio}>Nenhuma OS encontrada</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: {
    backgroundColor: '#1a1a2e', paddingTop: 50, paddingBottom: 16,
    paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end'
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  logoutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffffff22', borderRadius: 8 },
  logoutText: { color: '#fff', fontSize: 13 },
  filtros: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filtroBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0'
  },
  filtroBtnAtivo: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filtroText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  filtroTextAtivo: { color: '#fff' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  numero: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  cliente: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 4 },
  descricao: { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valor: { fontSize: 16, fontWeight: 'bold', color: '#2563eb' },
  data: { fontSize: 12, color: '#94a3b8' },
  vazio: { textAlign: 'center', marginTop: 60, color: '#94a3b8', fontSize: 15 },
});
