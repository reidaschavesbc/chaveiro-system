import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import { showToast } from '../components/AppAlert';

function fmtVal(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtDt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtData(d) {
  if (!d) return '—';
  const [y, m, dia] = String(d).slice(0, 10).split('-');
  return `${dia}/${m}/${y}`;
}

function fmtTel(v) {
  if (!v) return null;
  let d = String(v).replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2)  return '(' + d;
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

const STATUS = {
  aguardando: { label: 'Aguardando', color: '#f59e0b', bg: '#fef3c7', proxLabel: 'Iniciar',  prox: 'afiando'  },
  afiando:    { label: 'Afiando',    color: '#3b82f6', bg: '#dbeafe', proxLabel: 'Concluir', prox: 'pronto'   },
  pronto:     { label: 'Pronto',     color: '#10b981', bg: '#d1fae5', proxLabel: null,        prox: null       },
  entregue:   { label: 'Entregue',   color: '#6366f1', bg: '#e0e7ff', proxLabel: null,        prox: null       },
};

export default function AfiacaoScreen({ isAfiador }) {
  const insets = useSafeAreaInsets();
  const [aba, setAba]               = useState('fila');
  const [fichas, setFichas]         = useState([]);
  const [pendente, setPendente]     = useState(null);
  const [historico, setHistorico]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pagando, setPagando]       = useState(false);
  const [avancando, setAvancando]   = useState(null);
  const [modalConfig, setModalConfig] = useState(null);

  useFocusEffect(useCallback(() => {
    carregar();
    const id = setInterval(carregar, 30000);
    return () => clearInterval(id);
  }, []));

  async function carregar() {
    try {
      const [{ data: f }, { data: p }, { data: h }] = await Promise.all([
        api.get('/afiacao'),
        api.get('/afiacao-pendente'),
        api.get('/afiacao-historico'),
      ]);
      setFichas(f);
      setPendente(p);
      setHistorico(h);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function avancarStatus(ficha, novoStatus) {
    setAvancando(ficha.id);
    try {
      await api.put(`/afiacao/${ficha.id}/status`, { status: novoStatus });
      await carregar();
    } catch (e) {
      showToast(e.response?.data?.error || 'Não foi possível atualizar');
    } finally {
      setAvancando(null);
    }
  }

  function confirmarAvancar(ficha, cfg) {
    setModalConfig({
      title: `${cfg.proxLabel} ficha #${ficha.numero}`,
      subtitle: `Mover para "${STATUS[cfg.prox].label}"?`,
      confirmLabel: cfg.proxLabel,
      confirmColor: STATUS[cfg.prox].color,
      onConfirm: () => avancarStatus(ficha, cfg.prox),
    });
  }

  function confirmarPagar() {
    if (!pendente || pendente.qtd === 0) return;
    setModalConfig({
      title: '💰 Pagar Afiador',
      subtitle: `Confirmar pagamento de ${fmtVal(pendente.total)} ao afiador?\n${pendente.qtd} ficha(s) entregues`,
      confirmLabel: 'Confirmar Pagamento',
      confirmColor: '#10b981',
      onConfirm: async () => {
        setPagando(true);
        try {
          await api.post('/afiacao-pagar', {});
          showToast('Pagamento registrado com sucesso!', 'success');
          carregar();
        } catch (e) {
          showToast(e.response?.data?.erro || 'Não foi possível registrar');
        } finally {
          setPagando(false);
        }
      },
    });
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6366f1" />;

  const statusOrdem = ['aguardando', 'afiando', 'pronto', 'entregue'];

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>

      {/* Abas */}
      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tabBtn, aba === 'fila' && s.tabBtnActive]} onPress={() => setAba('fila')}>
          <Text style={[s.tabBtnText, aba === 'fila' && s.tabBtnTextActive]}>Fila</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, aba === 'pagamentos' && s.tabBtnActive]} onPress={() => setAba('pagamentos')}>
          <Text style={[s.tabBtnText, aba === 'pagamentos' && s.tabBtnTextActive]}>Pagamentos</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} tintColor="#6366f1" />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >

        {/* ── ABA FILA ── */}
        {aba === 'fila' && (
          <>
            {statusOrdem.filter(st => st !== 'entregue').map(status => {
              const cfg  = STATUS[status];
              const lista = fichas.filter(f => f.status === status);
              return (
                <View key={status} style={s.grupo}>
                  <View style={s.grupoHeader}>
                    <Text style={[s.grupoLabel, { color: cfg.color }]}>{cfg.label}</Text>
                    <View style={[s.grupoBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.grupoBadgeText, { color: cfg.color }]}>{lista.length}</Text>
                    </View>
                  </View>

                  {lista.length === 0 ? (
                    <Text style={s.vazio}>Nenhuma ficha</Text>
                  ) : (
                    lista.map(f => (
                      <View key={f.id} style={[s.fichaCard, { borderLeftColor: cfg.color }]}>
                        <View style={s.fichaTop}>
                          <Text style={s.fichaNum}>#{f.numero}</Text>
                          <Text style={s.fichaDt}>{fmtDt(f.criado_em)}</Text>
                        </View>
                        <Text style={s.fichaInfo}>
                          {f.quantidade} item(s) &nbsp;·&nbsp; {fmtVal(f.valor)}
                        </Text>
                        {f.cliente_nome ? <Text style={s.fichaSub}>👤 {f.cliente_nome}</Text> : null}
                        {fmtTel(f.cliente_telefone) ? <Text style={s.fichaSub}>📞 {fmtTel(f.cliente_telefone)}</Text> : null}
                        {f.observacao   ? <Text style={s.fichaObs}>{f.observacao}</Text> : null}

                        {cfg.prox && (
                          <TouchableOpacity
                            style={[s.btnAvancar, { backgroundColor: cfg.color }, avancando === f.id && { opacity: 0.6 }]}
                            onPress={() => confirmarAvancar(f, cfg)}
                            disabled={avancando === f.id}
                          >
                            {avancando === f.id
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Text style={s.btnAvancarText}>{cfg.proxLabel} →</Text>}
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </View>
              );
            })}

            {/* Resumo de prontos para entrega */}
            {(() => {
              const prontos = fichas.filter(f => f.status === 'pronto');
              if (!prontos.length) return null;
              return (
                <View style={[s.grupo, { borderColor: '#10b981' }]}>
                  <View style={s.grupoHeader}>
                    <Text style={[s.grupoLabel, { color: '#10b981' }]}>✅ Prontos — aguardando entrega</Text>
                  </View>
                  {prontos.map(f => (
                    <View key={f.id} style={[s.fichaCard, { borderLeftColor: '#10b981' }]}>
                      <View style={s.fichaTop}>
                        <Text style={s.fichaNum}>#{f.numero}</Text>
                        <Text style={s.fichaDt}>{fmtDt(f.criado_em)}</Text>
                      </View>
                      <Text style={s.fichaInfo}>{f.quantidade} item(s) · {fmtVal(f.valor)}</Text>
                      {f.cliente_nome ? <Text style={s.fichaSub}>👤 {f.cliente_nome}</Text> : null}
                      {fmtTel(f.cliente_telefone) ? <Text style={s.fichaSub}>📞 {fmtTel(f.cliente_telefone)}</Text> : null}
                      <TouchableOpacity
                        style={[s.btnAvancar, { backgroundColor: '#6366f1' }, avancando === f.id && { opacity: 0.6 }]}
                        onPress={() => confirmarAvancar(f, { proxLabel: 'Marcar Entregue', prox: 'entregue' })}
                        disabled={avancando === f.id}
                      >
                        {avancando === f.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={s.btnAvancarText}>Marcar Entregue →</Text>}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })()}
          </>
        )}

        {/* ── ABA PAGAMENTOS ── */}
        {aba === 'pagamentos' && (
          <>
            {/* Pendente */}
            {pendente && pendente.qtd > 0 ? (
              <View style={s.pendenteCard}>
                <Text style={s.pendenteTitle}>⏳ Pendente de Pagamento</Text>
                <View style={s.pendenteRow}>
                  <View style={s.pendenteItem}>
                    <Text style={s.pendenteItemLabel}>Fichas</Text>
                    <Text style={s.pendenteItemVal}>{pendente.qtd}</Text>
                  </View>
                  <View style={s.pendenteItem}>
                    <Text style={s.pendenteItemLabel}>Por afiação</Text>
                    <Text style={s.pendenteItemVal}>{fmtVal(pendente.valor_por_ficha)}</Text>
                  </View>
                  <View style={[s.pendenteItem, s.pendenteItemDestaque]}>
                    <Text style={s.pendenteItemLabel}>Total</Text>
                    <Text style={[s.pendenteItemVal, { color: '#f59e0b', fontSize: 22 }]}>{fmtVal(pendente.total)}</Text>
                  </View>
                </View>
                {!isAfiador && (
                  <TouchableOpacity
                    style={[s.btnPagar, pagando && { opacity: 0.6 }]}
                    onPress={confirmarPagar}
                    disabled={pagando}
                  >
                    {pagando
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={s.btnPagarText}>✅ Marcar como Pago — {fmtVal(pendente.total)}</Text>}
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={s.emDia}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>✅</Text>
                <Text style={s.emDiaText}>Afiador em dia!</Text>
                <Text style={s.emDiaSub}>Nenhum valor pendente de pagamento.</Text>
              </View>
            )}

            {/* Histórico */}
            <Text style={s.secTitle}>Histórico de Pagamentos</Text>
            {historico.length === 0 ? (
              <Text style={s.vazio}>Nenhum pagamento registrado ainda.</Text>
            ) : (
              historico.map(p => (
                <View key={p.id} style={s.pagtoCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pagtoVal}>{fmtVal(p.valor)}</Text>
                    <Text style={s.pagtoSub}>{p.qtd_fichas} ficha(s)</Text>
                    {p.data_inicio
                      ? <Text style={s.pagtoSub}>Período: {fmtData(p.data_inicio)} → {fmtData(p.data_fim)}</Text>
                      : null}
                    <Text style={s.pagtoSub}>Pago em: {fmtData(p.pago_em?.slice(0, 10))}</Text>
                  </View>
                  <View style={s.pagtoBadge}>
                    <Text style={s.pagtoBadgeText}>PAGO</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

      </ScrollView>

      <Modal
        transparent
        visible={!!modalConfig}
        animationType="fade"
        onRequestClose={() => setModalConfig(null)}
      >
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setModalConfig(null)}>
          <View style={s.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTitle}>{modalConfig?.title}</Text>
            {modalConfig?.subtitle ? <Text style={s.modalSub}>{modalConfig.subtitle}</Text> : null}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => setModalConfig(null)}>
                <Text style={s.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtnConfirm, { backgroundColor: modalConfig?.confirmColor || '#6366f1' }]}
                onPress={() => { const cfg = modalConfig; setModalConfig(null); cfg?.onConfirm?.(); }}
              >
                <Text style={s.modalBtnConfirmText}>{modalConfig?.confirmLabel} →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBtn: {
    flex: 1, paddingVertical: 13, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#6366f1' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  tabBtnTextActive: { color: '#6366f1' },

  grupo: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 14, elevation: 1,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  grupoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  grupoLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  grupoBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  grupoBadgeText: { fontSize: 12, fontWeight: '700' },

  fichaCard: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12,
    marginBottom: 8, borderLeftWidth: 4,
  },
  fichaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  fichaNum: { fontSize: 17, fontWeight: '800', color: '#1e293b' },
  fichaDt:  { fontSize: 11, color: '#94a3b8' },
  fichaInfo: { fontSize: 14, fontWeight: '600', color: '#334155' },
  fichaSub:  { fontSize: 12, color: '#64748b', marginTop: 3 },
  fichaObs:  { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 },

  btnAvancar: {
    marginTop: 10, paddingVertical: 9, borderRadius: 8,
    alignItems: 'center',
  },
  btnAvancarText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  vazio: { color: '#94a3b8', fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  pendenteCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 18,
    marginBottom: 16, elevation: 2,
    borderWidth: 2, borderColor: '#f59e0b',
  },
  pendenteTitle: { fontSize: 13, fontWeight: '700', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  pendenteRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pendenteItem: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 10,
    padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  pendenteItemDestaque: { borderColor: '#f59e0b', borderWidth: 2 },
  pendenteItemLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  pendenteItemVal: { fontSize: 18, fontWeight: '800', color: '#1e293b' },

  btnPagar: {
    backgroundColor: '#10b981', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  btnPagarText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  emDia: {
    backgroundColor: '#fff', borderRadius: 14, padding: 32,
    alignItems: 'center', marginBottom: 16, elevation: 1,
  },
  emDiaText: { fontSize: 16, fontWeight: '700', color: '#10b981' },
  emDiaSub:  { fontSize: 13, color: '#94a3b8', marginTop: 4, textAlign: 'center' },

  secTitle: {
    fontSize: 11, fontWeight: '700', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 4,
  },

  pagtoCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 8, elevation: 1,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  pagtoVal:  { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  pagtoSub:  { fontSize: 12, color: '#64748b', marginTop: 2 },
  pagtoBadge: {
    backgroundColor: '#d1fae5', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  pagtoBadgeText: { color: '#10b981', fontSize: 11, fontWeight: '700' },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginBottom: 6 },
  modalSub: { fontSize: 14, color: '#64748b', lineHeight: 20, marginBottom: 22 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtnCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    backgroundColor: '#f1f5f9', alignItems: 'center',
  },
  modalBtnCancelText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  modalBtnConfirm: {
    flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
  },
  modalBtnConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
