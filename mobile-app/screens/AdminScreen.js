import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';

const STATUS_LABEL = {
  aberta:       { label: 'Aberta',       color: '#f59e0b' },
  em_andamento: { label: 'Em andamento', color: '#3b82f6' },
  concluida:    { label: 'Concluída',    color: '#10b981' },
  cancelada:    { label: 'Cancelada',    color: '#ef4444' },
};

function fmtVal(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtData(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dia] = s.split('-');
  return `${dia}/${m}/${y}`;
}

export default function AdminScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [resumo, setResumo] = useState(null);
  const [os, setOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroVendedor, setFiltroVendedor] = useState(null);
  const [aba, setAba] = useState('resumo'); // 'resumo' | 'os'

  useFocusEffect(useCallback(() => { carregar(); }, []));

  async function carregar() {
    try {
      const [rRes, rOs] = await Promise.all([
        api.get('/admin/resumo'),
        api.get('/admin/os'),
      ]);
      setResumo(rRes.data);
      setOs(rOs.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function filtrarPorVendedor(id) {
    const novoFiltro = filtroVendedor === id ? null : id;
    setFiltroVendedor(novoFiltro);
    try {
      const params = novoFiltro ? `?vendedor_id=${novoFiltro}` : '';
      const { data } = await api.get(`/admin/os${params}`);
      setOs(data);
    } catch {}
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#7c3aed" />;

  const osFiltradas = filtroVendedor ? os.filter(o => o.vendedor_id === filtroVendedor) : os;

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      {/* Abas */}
      <View style={s.abas}>
        {[['resumo', '📊 Resumo'], ['os', '📋 OS Abertas']].map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.aba, aba === key && s.abaAtiva]} onPress={() => setAba(key)}>
            <Text style={[s.abaText, aba === key && s.abaTextAtiva]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} tintColor="#7c3aed" />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        {/* ── ABA RESUMO ── */}
        {aba === 'resumo' && resumo && (
          <>
            {/* Cards de stats */}
            <View style={s.statsGrid}>
              <View style={[s.statCard, { borderLeftColor: '#f59e0b' }]}>
                <Text style={s.statNum}>{resumo.abertas}</Text>
                <Text style={s.statLabel}>Abertas</Text>
              </View>
              <View style={[s.statCard, { borderLeftColor: '#3b82f6' }]}>
                <Text style={s.statNum}>{resumo.em_andamento}</Text>
                <Text style={s.statLabel}>Em andamento</Text>
              </View>
              <View style={[s.statCard, { borderLeftColor: '#10b981' }]}>
                <Text style={s.statNum}>{resumo.concluidas_hoje}</Text>
                <Text style={s.statLabel}>Concluídas hoje</Text>
              </View>
              <View style={[s.statCard, { borderLeftColor: '#7c3aed' }]}>
                <Text style={[s.statNum, { fontSize: 16 }]}>{fmtVal(resumo.faturado_hoje)}</Text>
                <Text style={s.statLabel}>Faturado hoje</Text>
              </View>
            </View>

            {/* Funcionários */}
            <Text style={s.secTitulo}>👥 Funcionários</Text>
            {(resumo.funcionarios || []).map(f => (
              <TouchableOpacity
                key={f.id}
                style={[s.funcCard, filtroVendedor === f.id && { borderColor: '#7c3aed', borderWidth: 2 }]}
                onPress={() => { setFiltroVendedor(f.id); setAba('os'); filtrarPorVendedor(f.id); }}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.funcNome}>{f.nome}</Text>
                    {f.is_admin ? <Text style={s.adminBadge}>👑</Text> : null}
                  </View>
                  <Text style={s.funcSub}>
                    {f.os_abertas > 0
                      ? `${f.os_abertas} OS em aberto · ${f.os_hoje} concluída(s) hoje`
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
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── ABA OS ABERTAS ── */}
        {aba === 'os' && (
          <>
            {/* Filtro por funcionário */}
            {resumo?.funcionarios?.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[s.filtroBtn, !filtroVendedor && s.filtroBtnAtivo]}
                    onPress={() => { setFiltroVendedor(null); carregar(); }}
                  >
                    <Text style={[s.filtroBtnText, !filtroVendedor && s.filtroBtnTextAtivo]}>Todos</Text>
                  </TouchableOpacity>
                  {resumo.funcionarios.map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[s.filtroBtn, filtroVendedor === f.id && s.filtroBtnAtivo]}
                      onPress={() => filtrarPorVendedor(f.id)}
                    >
                      <Text style={[s.filtroBtnText, filtroVendedor === f.id && s.filtroBtnTextAtivo]}>{f.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {osFiltradas.length === 0 ? (
              <Text style={s.vazio}>Nenhuma OS em aberto</Text>
            ) : (
              osFiltradas.map(o => {
                const st = STATUS_LABEL[o.status] || { label: o.status, color: '#666' };
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[s.osCard, o.is_plantao ? { borderLeftColor: '#7c3aed' } : {}]}
                    onPress={() => navigation.navigate('OSDetalhe', { osId: o.id })}
                  >
                    <View style={s.osHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.osNumero}>{o.numero}</Text>
                        {o.is_plantao ? <Text style={s.plantaoBadge}>🌙</Text> : null}
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: st.color + '22' }]}>
                        <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    <Text style={s.osCliente}>{o.cliente_nome_avulso || o.cliente_nome || '—'}</Text>
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
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  abas: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  aba: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  abaAtiva: { borderBottomColor: '#7c3aed' },
  abaText: { fontSize: 14, color: '#94a3b8', fontWeight: '600' },
  abaTextAtiva: { color: '#7c3aed' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderLeftWidth: 4, elevation: 1,
  },
  statNum: { fontSize: 26, fontWeight: '800', color: '#1e293b' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '500' },
  secTitulo: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  funcCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', elevation: 1, borderWidth: 1, borderColor: '#e2e8f0',
  },
  funcNome: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  funcSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  adminBadge: { fontSize: 14 },
  osBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  osBadgeNum: { fontSize: 18, fontWeight: '800' },
  novaOsBtn: {
    backgroundColor: '#2563eb', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  novaOsBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  filtroBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  filtroBtnAtivo: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  filtroBtnText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  filtroBtnTextAtivo: { color: '#fff' },
  osCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#3b82f6', elevation: 1,
  },
  osHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  osNumero: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  plantaoBadge: { fontSize: 13 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  osCliente: { fontSize: 14, color: '#334155', fontWeight: '500', marginBottom: 2 },
  osVendedor: { fontSize: 12, color: '#7c3aed', marginBottom: 4 },
  osFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  osData: { fontSize: 12, color: '#94a3b8' },
  osValor: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  vazio: { textAlign: 'center', marginTop: 60, color: '#94a3b8', fontSize: 15 },
});
