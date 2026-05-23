import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, AppState, Modal, ScrollView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const STATUS_LABEL = {
  aberta:       { label: 'Aberta',       color: '#f59e0b' },
  em_andamento: { label: 'Em andamento', color: '#3b82f6' },
  concluida:    { label: 'Concluída',    color: '#10b981' },
  cancelada:    { label: 'Cancelada',    color: '#ef4444' },
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
  const [filtroStatus, setFiltroStatus] = useState('abertas');
  const [funcionario, setFuncionario] = useState(null);

  // ADM
  const [modoAdm, setModoAdm] = useState(false);
  const [lojaAdm, setLojaAdm] = useState(null); // { id, nome }
  const [admStats, setAdmStats] = useState(null);
  const [modalLojas, setModalLojas] = useState(false);

  const intervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  useFocusEffect(useCallback(() => {
    carregarFuncionario();
    carregarOS();

    intervalRef.current = setInterval(() => {
      if (appStateRef.current === 'active') carregarOS();
    }, 30000);

    const sub = AppState.addEventListener('change', state => { appStateRef.current = state; });
    return () => { clearInterval(intervalRef.current); sub.remove(); };
  }, [filtroStatus, modoAdm, lojaAdm]));

  async function carregarFuncionario() {
    const f = await AsyncStorage.getItem('funcionario');
    if (f) setFuncionario(JSON.parse(f));
  }

  async function carregarOS() {
    try {
      if (modoAdm && lojaAdm) {
        const [statsRes, osRes] = await Promise.all([
          api.get('/adm-stats', { params: { loja_id: lojaAdm.id } }),
          api.get('/os', { params: { adm: '1', loja_id: lojaAdm.id, status: filtroStatus === 'abertas' ? undefined : filtroStatus } }),
        ]);
        setAdmStats(statsRes.data);
        setOs(osRes.data);
      } else {
        const params = filtroStatus === 'abertas' ? {} : { status: filtroStatus };
        const { data } = await api.get('/os', { params });
        setOs(data);
      }
    } catch (e) {
      if (e.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function abrirCoroa() {
    const func = funcionario;
    if (!func?.is_admin) return;
    const lojasExternas = func.lojas_adm || [];
    const todasLojas = [{ id: func.loja_id, nome: 'Minha loja' }, ...lojasExternas];

    if (todasLojas.length === 1) {
      entrarAdm({ id: func.loja_id, nome: 'Minha loja' });
    } else {
      setModalLojas(true);
    }
  }

  function entrarAdm(loja) {
    setLojaAdm(loja);
    setModoAdm(true);
    setFiltroStatus('abertas');
    setAdmStats(null);
    setLoading(true);
    setModalLojas(false);
  }

  function sairAdm() {
    setModoAdm(false);
    setLojaAdm(null);
    setAdmStats(null);
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
        {modoAdm && item.vendedor_nome
          ? <Text style={s.vendedor}>Resp: {item.vendedor_nome}</Text>
          : null}
        <Text style={s.descricao} numberOfLines={2}>{item.descricao}</Text>
        <View style={s.cardBottom}>
          <Text style={s.valor}>{fmtVal(item.valor)}</Text>
          {item.data_prevista ? <Text style={s.data}>Prev: {fmtData(item.data_prevista)}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  }

  const isAdmin = funcionario?.is_admin;
  const lojasExternas = funcionario?.lojas_adm || [];

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, modoAdm && s.headerAdm]}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>
            {modoAdm ? `ADM — ${lojaAdm?.nome || 'Todas as OS'}` : 'Minhas OS'}
          </Text>
          {funcionario && <Text style={s.headerSub}>Olá, {funcionario.nome.split(' ')[0]}!</Text>}
        </View>
        <View style={s.headerAcoes}>
          {isAdmin && !modoAdm && (
            <TouchableOpacity onPress={abrirCoroa} style={s.iconBtn}>
              {/* Coroa */}
              <Text style={s.iconCoroa}>♛</Text>
            </TouchableOpacity>
          )}
          {modoAdm && (
            <TouchableOpacity onPress={sairAdm} style={s.voltarBtn}>
              <Text style={s.voltarText}>← Voltar</Text>
            </TouchableOpacity>
          )}
          {!modoAdm && (
            <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
              <Text style={s.logoutText}>Sair</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Cards ADM */}
      {modoAdm && admStats && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.cardsScroll} contentContainerStyle={s.cardsRow}>
          <View style={[s.statCard, { backgroundColor: '#1e3a5f' }]}>
            <Text style={s.statNum}>{admStats.em_andamento}</Text>
            <Text style={s.statLabel}>Em andamento</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#78350f' }]}>
            <Text style={s.statNum}>{admStats.abertas}</Text>
            <Text style={s.statLabel}>Abertas</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#14532d' }]}>
            <Text style={s.statNum}>{admStats.finalizadas_hoje}</Text>
            <Text style={s.statLabel}>Finalizadas hoje</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#450a0a' }]}>
            <Text style={s.statNum}>{admStats.canceladas_hoje}</Text>
            <Text style={s.statLabel}>Canceladas hoje</Text>
          </View>
          <View style={[s.statCard, s.statCardValor]}>
            <Text style={[s.statNum, { fontSize: 16 }]}>{fmtVal(admStats.valor_hoje)}</Text>
            <Text style={s.statLabel}>Valor do dia</Text>
          </View>
        </ScrollView>
      )}

      {/* Filtros de status */}
      <View style={[s.filtros, modoAdm && s.filtrosAdm]}>
        {['abertas', 'em_andamento', 'concluida', 'cancelada'].map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filtroBtn, filtroStatus === f && (modoAdm ? s.filtroBtnAtivoAdm : s.filtroBtnAtivo)]}
            onPress={() => { setFiltroStatus(f); setLoading(true); }}
          >
            <Text style={[s.filtroText, filtroStatus === f && s.filtroTextAtivo]} numberOfLines={1}>
              {f === 'abertas' ? 'Abertas' : f === 'em_andamento' ? 'Andamento' : f === 'concluida' ? 'Concluídas' : 'Canceladas'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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

      {/* Modal seleção de loja */}
      <Modal visible={modalLojas} transparent animationType="fade" onRequestClose={() => setModalLojas(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setModalLojas(false)}>
          <View style={s.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTitulo}>Qual loja deseja ver?</Text>
            <TouchableOpacity style={s.lojaOpcao} onPress={() => entrarAdm({ id: funcionario.loja_id, nome: funcionario.nome.split(' ')[0] + ' (sua loja)' })}>
              <Text style={s.lojaOpcaoText}>⭐ Minha loja</Text>
            </TouchableOpacity>
            {lojasExternas.map(l => (
              <TouchableOpacity key={l.id} style={s.lojaOpcao} onPress={() => entrarAdm(l)}>
                <Text style={s.lojaOpcaoText}>{l.nome}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.modalCancelar} onPress={() => setModalLojas(false)}>
              <Text style={s.modalCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  // Header
  header: {
    backgroundColor: '#1a1a2e', paddingTop: 50, paddingBottom: 16,
    paddingHorizontal: 20, flexDirection: 'row', alignItems: 'flex-end',
  },
  headerAdm: { backgroundColor: '#7f1d1d' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  headerAcoes: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 6 },
  iconCoroa: { fontSize: 22, color: '#fbbf24' },
  voltarBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffffff22', borderRadius: 8 },
  voltarText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  logoutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffffff22', borderRadius: 8 },
  logoutText: { color: '#fff', fontSize: 13 },

  // Cards ADM
  cardsScroll: { backgroundColor: '#1a1a2e', maxHeight: 110 },
  cardsRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  statCard: {
    borderRadius: 12, padding: 14, minWidth: 110, alignItems: 'center', justifyContent: 'center',
  },
  statCardValor: { backgroundColor: '#1c3a2e', minWidth: 150 },
  statNum: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  statLabel: { fontSize: 11, color: '#94a3b8', marginTop: 2, textAlign: 'center' },

  // Filtros
  filtros: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 10, gap: 5 },
  filtrosAdm: { backgroundColor: '#fef2f2' },
  filtroBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  filtroBtnAtivo: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filtroBtnAtivoAdm: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  filtroText: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  filtroTextAtivo: { color: '#fff' },

  // Cards OS
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  numero: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  cliente: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 2 },
  vendedor: { fontSize: 11, color: '#dc2626', fontWeight: '600', marginBottom: 4 },
  descricao: { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valor: { fontSize: 16, fontWeight: 'bold', color: '#2563eb' },
  data: { fontSize: 12, color: '#94a3b8' },
  vazio: { textAlign: 'center', marginTop: 60, color: '#94a3b8', fontSize: 15 },

  // Modal de seleção de loja
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, width: '80%' },
  modalTitulo: { fontSize: 16, fontWeight: 'bold', color: '#f1f5f9', marginBottom: 16, textAlign: 'center' },
  lojaOpcao: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  lojaOpcaoText: { fontSize: 15, color: '#e2e8f0', fontWeight: '600' },
  modalCancelar: { marginTop: 16, alignItems: 'center' },
  modalCancelarText: { color: '#64748b', fontSize: 14 },
});
