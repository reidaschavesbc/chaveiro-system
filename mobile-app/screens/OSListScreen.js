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

const ABAS_MINHAS = ['abertas', 'concluida', 'cancelada'];
const ABAS_ADM = ['abertas', 'concluida', 'cancelada', 'cancelada_adm'];

const ABA_LABEL = {
  abertas: 'Abertas',
  concluida: 'Concluídas',
  cancelada: 'Canceladas',
};

const DIAS_ADM = [
  { value: 7, label: '7 dias' },
  { value: 15, label: '15 dias' },
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
];

export default function OSListScreen({ navigation, onLogout }) {
  const [os, setOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('abertas');
  const [modoAdm, setModoAdm] = useState(false);
  const [diasAdm, setDiasAdm] = useState(30);
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
  }, [filtroStatus, modoAdm, diasAdm]));

  async function carregarFuncionario() {
    const f = await AsyncStorage.getItem('funcionario');
    if (f) setFuncionario(JSON.parse(f));
  }

  async function carregarOS() {
    try {
      let params = {};
      if (modoAdm) {
        params = { adm: '1', dias: diasAdm };
        if (filtroStatus !== 'abertas') {
          params.status = filtroStatus;
        } else {
          params.status = 'aberta';
        }
      } else {
        if (filtroStatus === 'abertas') {
          params = {};
        } else {
          params = { status: filtroStatus };
        }
      }
      const { data } = await api.get('/os', { params });
      setOs(data);
    } catch (e) {
      if (e.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function trocarModo(adm) {
    setModoAdm(adm);
    setFiltroStatus('abertas');
    setLoading(true);
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
        {modoAdm && item.vendedor_nome ? (
          <Text style={s.vendedor}>Responsável: {item.vendedor_nome}</Text>
        ) : null}
        <Text style={s.descricao} numberOfLines={2}>{item.descricao}</Text>
        <View style={s.cardBottom}>
          <Text style={s.valor}>{fmtVal(item.valor)}</Text>
          {item.data_prevista ? <Text style={s.data}>Previsto: {fmtData(item.data_prevista)}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  }

  const isAdmin = funcionario?.is_admin;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, modoAdm && s.headerAdm]}>
        <View>
          <Text style={s.headerTitle}>{modoAdm ? 'ADM — Todas as OS' : 'Minhas OS'}</Text>
          {funcionario && <Text style={s.headerSub}>Olá, {funcionario.nome.split(' ')[0]}!</Text>}
        </View>
        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* Seletor ADM / Minhas OS (apenas para admin) */}
      {isAdmin && (
        <View style={s.modoSelector}>
          <TouchableOpacity
            style={[s.modoBtn, !modoAdm && s.modoBtnAtivo]}
            onPress={() => trocarModo(false)}
          >
            <Text style={[s.modoText, !modoAdm && s.modoTextAtivo]}>Minhas OS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modoBtn, modoAdm && s.modoBtnAtivoAdm]}
            onPress={() => trocarModo(true)}
          >
            <Text style={[s.modoText, modoAdm && s.modoTextAtivo]}>ADM</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filtro de status */}
      <View style={s.filtros}>
        {['abertas', 'concluida', 'cancelada'].map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filtroBtn, filtroStatus === f && (modoAdm ? s.filtroBtnAtivoAdm : s.filtroBtnAtivo)]}
            onPress={() => { setFiltroStatus(f); setLoading(true); }}
          >
            <Text style={[s.filtroText, filtroStatus === f && s.filtroTextAtivo]}>
              {ABA_LABEL[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filtro de período (modo ADM) */}
      {modoAdm && (
        <View style={s.diasFiltros}>
          <Text style={s.diasLabel}>Período:</Text>
          {DIAS_ADM.map(d => (
            <TouchableOpacity
              key={d.value}
              style={[s.diaBtn, diasAdm === d.value && s.diaBtnAtivoAdm]}
              onPress={() => { setDiasAdm(d.value); setLoading(true); }}
            >
              <Text style={[s.diaText, diasAdm === d.value && s.diaTextAtivo]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={modoAdm ? '#dc2626' : '#2563eb'} />
      ) : (
        <FlatList
          data={os}
          keyExtractor={i => String(i.id)}
          renderItem={renderOS}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregarOS(); }}
              colors={[modoAdm ? '#dc2626' : '#2563eb']}
            />
          }
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
  headerAdm: { backgroundColor: '#7f1d1d' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  logoutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffffff22', borderRadius: 8 },
  logoutText: { color: '#fff', fontSize: 13 },

  // Seletor ADM / Minhas OS
  modoSelector: {
    flexDirection: 'row', backgroundColor: '#1e293b',
    paddingHorizontal: 16, paddingVertical: 8, gap: 8,
  },
  modoBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#334155',
  },
  modoBtnAtivo: { backgroundColor: '#2563eb' },
  modoBtnAtivoAdm: { backgroundColor: '#dc2626' },
  modoText: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },
  modoTextAtivo: { color: '#fff' },

  // Filtros de status
  filtros: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  filtroBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0'
  },
  filtroBtnAtivo: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filtroBtnAtivoAdm: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  filtroText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  filtroTextAtivo: { color: '#fff' },

  // Filtro de período (ADM)
  diasFiltros: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexWrap: 'wrap',
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9'
  },
  diasLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginRight: 4 },
  diaBtn: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0'
  },
  diaBtnAtivoAdm: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  diaText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  diaTextAtivo: { color: '#fff' },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  numero: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  cliente: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 2 },
  vendedor: { fontSize: 12, color: '#dc2626', fontWeight: '600', marginBottom: 4 },
  descricao: { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valor: { fontSize: 16, fontWeight: 'bold', color: '#2563eb' },
  data: { fontSize: 12, color: '#94a3b8' },
  vazio: { textAlign: 'center', marginTop: 60, color: '#94a3b8', fontSize: 15 },
});
