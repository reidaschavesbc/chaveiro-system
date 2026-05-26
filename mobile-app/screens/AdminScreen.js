import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';

const { width: SCREEN_W } = Dimensions.get('window');
const PAD = 16;
const GAP = 10;
const CARD_W = (SCREEN_W - PAD * 2 - GAP) / 2;
const CARD_H = 82;
const WIDE_H = 64;

const STATUS_LABEL = {
  aberta:       { label: 'Aberta',       color: '#f59e0b' },
  em_andamento: { label: 'Em andamento', color: '#3b82f6' },
  concluida:    { label: 'Concluída',    color: '#10b981' },
  cancelada:    { label: 'Cancelada',    color: '#ef4444' },
};

const CARDS = [
  { key: 'em_andamento', label: 'Em andamento', color: '#3b82f6', status: 'em_andamento' },
  { key: 'abertas',      label: 'Abertas',      color: '#f59e0b', status: 'aberta'       },
  { key: 'finalizadas',  label: 'Finalizadas',  color: '#10b981', status: 'concluida',  hasPeriodo: true },
  { key: 'canceladas',   label: 'Canceladas',   color: '#ef4444', status: 'cancelada',  hasPeriodo: true },
];
const CARD_VALOR     = { key: 'valor_hoje',     label: 'Valor do dia',          color: '#7c3aed', status: 'concluida',  hasPeriodo: false };
const CARD_COBRANCAS = { key: 'cobrancas_hoje', label: 'Cobranças recebidas',   color: '#0891b2', status: 'cobrancas',  hasPeriodo: true  };

const PERIODO_LABELS = { 1: 'Hoje', 2: '2 dias', 3: '3 dias' };

function fmtVal(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtData(d) {
  if (!d) return '—';
  const [y, m, dia] = String(d).slice(0, 10).split('-');
  return `${dia}/${m}/${y}`;
}

export default function AdminScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardSel, setCardSel]       = useState(null);
  const [osList, setOsList]         = useState([]);
  const [loadingOS, setLoadingOS]   = useState(false);
  const [funcFiltro, setFuncFiltro] = useState(null);
  const [modalFunc, setModalFunc]   = useState(false);
  const [periodoFiltro, setPeriodoFiltro] = useState(1);

  useFocusEffect(useCallback(() => { carregar(); }, []));

  async function carregar() {
    try {
      const { data } = await api.get('/adm-stats');
      setStats(data);
      navigation.setOptions({ title: `ADM — ${data.loja_nome || 'Painel'}` });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function buscarOS(card, dias, func) {
    setLoadingOS(true);
    try {
      const params = { adm: '1', status: card.status, dias };
      if (func) params.funcionario_id = func.id;
      const { data } = await api.get('/os', { params });
      setOsList(data);
    } catch {}
    finally { setLoadingOS(false); }
  }

  async function selecionarCard(card) {
    if (cardSel?.key === card.key) {
      setCardSel(null); setOsList([]); setFuncFiltro(null); setPeriodoFiltro(1);
      return;
    }
    setCardSel(card);
    setFuncFiltro(null);
    setPeriodoFiltro(1);
    await buscarOS(card, 1, null);
  }

  async function selecionarFuncionario(func) {
    setModalFunc(false);
    setFuncFiltro(func);
    await buscarOS(cardSel, periodoFiltro, func);
  }

  async function selecionarPeriodo(dias) {
    setPeriodoFiltro(dias);
    await buscarOS(cardSel, dias, funcFiltro);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#7c3aed" />;

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); carregar(); }}
            tintColor="#7c3aed"
          />
        }
        contentContainerStyle={{ padding: PAD, paddingBottom: 32 }}
      >
        {/* Grade 2x2 */}
        <View style={s.grid}>
          {CARDS.map(card => {
            const sel = cardSel?.key === card.key;
            return (
              <TouchableOpacity
                key={card.key}
                activeOpacity={0.75}
                style={[
                  s.card,
                  { borderLeftColor: card.color, width: CARD_W, height: CARD_H },
                  sel && { backgroundColor: card.color + '18', borderColor: card.color, borderWidth: 1.5 },
                ]}
                onPress={() => selecionarCard(card)}
              >
                <Text style={[s.cardNum, { color: sel ? card.color : '#1e293b' }]}>
                  {stats?.[card.key] ?? 0}
                </Text>
                <Text style={s.cardLabel}>{card.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Card largo — Valor do dia */}
        {(() => {
          const sel = cardSel?.key === CARD_VALOR.key;
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              style={[
                s.cardWide,
                { borderLeftColor: CARD_VALOR.color },
                sel && { backgroundColor: CARD_VALOR.color + '18', borderColor: CARD_VALOR.color, borderWidth: 1.5 },
              ]}
              onPress={() => selecionarCard(CARD_VALOR)}
            >
              <Text style={[s.cardWideNum, { color: sel ? CARD_VALOR.color : '#1e293b' }]}>
                {fmtVal(stats?.valor_hoje)}
              </Text>
              <Text style={s.cardLabel}>{CARD_VALOR.label}</Text>
            </TouchableOpacity>
          );
        })()}

        {/* Card largo — Cobranças recebidas */}
        {(() => {
          const sel = cardSel?.key === CARD_COBRANCAS.key;
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              style={[
                s.cardWide,
                { borderLeftColor: CARD_COBRANCAS.color },
                sel && { backgroundColor: CARD_COBRANCAS.color + '18', borderColor: CARD_COBRANCAS.color, borderWidth: 1.5 },
              ]}
              onPress={() => selecionarCard(CARD_COBRANCAS)}
            >
              <Text style={[s.cardWideNum, { color: sel ? CARD_COBRANCAS.color : '#1e293b' }]}>
                {fmtVal(stats?.cobrancas_hoje)}
              </Text>
              <Text style={s.cardLabel}>{CARD_COBRANCAS.label}</Text>
            </TouchableOpacity>
          );
        })()}

        {/* Conteúdo dinâmico */}
        {cardSel ? (
          <>
            <View style={s.filtroHeader}>
              <Text style={[s.filtroTitulo, { color: cardSel.color }]}>
                {cardSel.label}
                {!loadingOS ? ` (${osList.length})` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {cardSel.status !== 'aberta' && cardSel.status !== 'em_andamento' && (
                  <TouchableOpacity style={s.funcFiltroBtn} onPress={() => setModalFunc(true)}>
                    <Text style={s.funcFiltroBtnText}>
                      {funcFiltro ? funcFiltro.nome.split(' ')[0] : 'Todos'} ▾
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => { setCardSel(null); setOsList([]); setFuncFiltro(null); setPeriodoFiltro(1); }}
                  style={s.fecharBtn}
                >
                  <Text style={s.fecharText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Filtro de período */}
            {cardSel.hasPeriodo && (
              <View style={s.periodoRow}>
                {[1, 2, 3].map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[s.periodoPill, periodoFiltro === d && { backgroundColor: cardSel.color + '22', borderColor: cardSel.color }]}
                    onPress={() => selecionarPeriodo(d)}
                  >
                    <Text style={[s.periodoPillText, periodoFiltro === d && { color: cardSel.color, fontWeight: '700' }]}>
                      {PERIODO_LABELS[d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Modal visible={modalFunc} transparent animationType="fade" onRequestClose={() => setModalFunc(false)}>
              <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setModalFunc(false)}>
                <View style={s.modalBox}>
                  <TouchableOpacity style={s.modalItem} onPress={() => selecionarFuncionario(null)}>
                    <Text style={[s.modalItemText, !funcFiltro && { color: '#7c3aed', fontWeight: '700' }]}>✓ Todos</Text>
                  </TouchableOpacity>
                  {(stats?.funcionarios || []).map(f => (
                    <TouchableOpacity key={f.id} style={s.modalItem} onPress={() => selecionarFuncionario(f)}>
                      <Text style={[s.modalItemText, funcFiltro?.id === f.id && { color: '#7c3aed', fontWeight: '700' }]}>
                        {funcFiltro?.id === f.id ? '✓ ' : '   '}{f.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableOpacity>
            </Modal>

            {loadingOS ? (
              <ActivityIndicator style={{ marginTop: 24 }} color="#7c3aed" />
            ) : osList.length === 0 ? (
              <Text style={s.vazio}>Nenhuma OS encontrada</Text>
            ) : (
              osList.map(o => {
                const st = STATUS_LABEL[o.status] || { label: o.status, color: '#666' };
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[s.osCard, { borderLeftColor: st.color }]}
                    onPress={() => navigation.navigate('OSDetalhe', { osId: o.id })}
                  >
                    <View style={s.osHeader}>
                      <Text style={s.osNumero}>{o.numero}</Text>
                      <View style={[s.statusBadge, { backgroundColor: st.color + '22' }]}>
                        <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    <Text style={s.osCliente}>{o.cliente_nome_fantasia || o.cliente_nome || '—'}</Text>
                    {o.vendedor_nome ? <Text style={s.osVendedor}>👤 {o.vendedor_nome}</Text> : null}
                    <View style={s.osFooter}>
                      <Text style={s.osData}>{fmtData(o.data_entrada)}</Text>
                      <Text style={s.osValor}>{fmtVal(o.valor)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : (
          <>
            <Text style={s.secTitulo}>👥 Funcionários</Text>
            {(stats?.funcionarios || []).map(f => (
              <View key={f.id} style={s.funcCard}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.funcNome}>{f.nome}</Text>
                    {f.is_admin ? <Text style={{ fontSize: 14 }}>👑</Text> : null}
                  </View>
                  <Text style={s.funcSub}>
                    {f.os_abertas > 0
                      ? `${f.os_abertas} em aberto · ${f.os_hoje} concluída(s) hoje`
                      : `Sem OS abertas · ${f.os_hoje} concluída(s) hoje`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={s.novaOsBtn}
                    onPress={() => navigation.navigate('OSNova', { vendedor_id: f.id, vendedor_nome: f.nome })}
                  >
                    <Text style={s.novaOsBtnText}>+ OS</Text>
                  </TouchableOpacity>
                  <View style={[s.osBadge, { backgroundColor: f.os_abertas > 0 ? '#fef3c7' : '#f0fdf4' }]}>
                    <Text style={[s.osBadgeNum, { color: f.os_abertas > 0 ? '#d97706' : '#16a34a' }]}>
                      {f.os_abertas}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: GAP },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderLeftWidth: 4, elevation: 2,
    justifyContent: 'center',
  },
  cardNum: { fontSize: 26, fontWeight: '800' },
  cardLabel: { fontSize: 12, color: '#64748b', marginTop: 3, fontWeight: '500' },

  cardWide: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 0,
    borderLeftWidth: 4, elevation: 2,
    height: WIDE_H, marginBottom: GAP,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  cardWideNum: { fontSize: 20, fontWeight: '800' },

  filtroHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8, marginTop: 8,
  },
  filtroTitulo: { fontSize: 15, fontWeight: '700' },
  fecharBtn: { padding: 6 },
  fecharText: { fontSize: 16, color: '#94a3b8', fontWeight: '700' },

  periodoRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
  },
  periodoPill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  periodoPillText: { fontSize: 13, color: '#64748b' },

  osCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderLeftWidth: 3, elevation: 1,
  },
  osHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  osNumero: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  osCliente: { fontSize: 14, color: '#334155', fontWeight: '500', marginBottom: 2 },
  osVendedor: { fontSize: 12, color: '#7c3aed', marginBottom: 4 },
  osFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  osData: { fontSize: 12, color: '#94a3b8' },
  osValor: { fontSize: 14, fontWeight: '700', color: '#2563eb' },

  secTitulo: {
    fontSize: 11, fontWeight: '700', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 2,
  },
  funcCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', elevation: 1,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  funcNome: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  funcSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  novaOsBtn: {
    backgroundColor: '#2563eb', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  novaOsBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  osBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  osBadgeNum: { fontSize: 18, fontWeight: '800' },

  vazio: { textAlign: 'center', marginTop: 40, color: '#94a3b8', fontSize: 15 },

  funcFiltroBtn: {
    backgroundColor: '#f1f5f9', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  funcFiltroBtnText: { fontSize: 13, color: '#334155', fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start', alignItems: 'flex-end',
    paddingTop: 120, paddingRight: 16,
  },
  modalBox: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 6, minWidth: 180,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
  },
  modalItem: { paddingHorizontal: 16, paddingVertical: 12 },
  modalItemText: { fontSize: 15, color: '#334155' },
});
