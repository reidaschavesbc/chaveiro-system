import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal
} from 'react-native';
import api from '../services/api';

const STATUS_LABEL = {
  aberta: { label: 'Aberta', color: '#f59e0b' },
  em_andamento: { label: 'Em andamento', color: '#3b82f6' },
  concluida: { label: 'Concluída', color: '#10b981' },
  cancelada: { label: 'Cancelada', color: '#ef4444' },
};

const PG_LABEL = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito' };

function fmtData(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dia] = s.split('-');
  return `${dia}/${m}/${y}`;
}

function fmtVal(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function OSDetalheScreen({ route, navigation }) {
  const { osId } = route.params;
  const [os, setOs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalStatus, setModalStatus] = useState(false);
  const [obs, setObs] = useState('');
  const [editandoObs, setEditandoObs] = useState(false);

  useEffect(() => { carregarOS(); }, []);

  async function carregarOS() {
    try {
      const { data } = await api.get(`/os/${osId}`);
      setOs(data);
      setObs(data.observacoes || '');
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar a OS');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function atualizarStatus(novoStatus, formaPagamento) {
    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, { status: novoStatus, forma_pagamento: formaPagamento || undefined });
      setOs(prev => ({ ...prev, status: novoStatus, forma_pagamento: formaPagamento || prev.forma_pagamento }));
      setModalStatus(false);
      Alert.alert('✅ Atualizado!', `OS marcada como ${STATUS_LABEL[novoStatus]?.label}`);
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao atualizar');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarObs() {
    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, { observacoes: obs });
      setOs(prev => ({ ...prev, observacoes: obs }));
      setEditandoObs(false);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#2563eb" />;
  if (!os) return null;

  const st = STATUS_LABEL[os.status] || { label: os.status, color: '#666' };
  const podeAtualizar = ['aberta', 'em_andamento'].includes(os.status);

  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>

        {/* Header OS */}
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.numero}>{os.numero}</Text>
            <View style={[s.badge, { backgroundColor: st.color + '22' }]}>
              <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>
          <Text style={s.descricao}>{os.descricao}</Text>
        </View>

        {/* Cliente */}
        <View style={s.card}>
          <Text style={s.secLabel}>Cliente</Text>
          <Text style={s.secValue}>{os.cliente_nome}</Text>
          {os.cliente_telefone ? <Text style={s.secSub}>📞 {os.cliente_telefone}</Text> : null}
          {os.cliente_endereco ? <Text style={s.secSub}>📍 {os.cliente_endereco}</Text> : null}
        </View>

        {/* Valores e datas */}
        <View style={s.card}>
          <View style={s.grid}>
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>Valor</Text>
              <Text style={s.gridValue}>{fmtVal(os.valor)}</Text>
            </View>
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>Pagamento</Text>
              <Text style={s.gridValue}>{PG_LABEL[os.forma_pagamento] || '—'}</Text>
            </View>
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>Entrada</Text>
              <Text style={s.gridValue}>{fmtData(os.data_entrada)}</Text>
            </View>
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>Previsto</Text>
              <Text style={s.gridValue}>{fmtData(os.data_prevista)}</Text>
            </View>
          </View>
        </View>

        {/* Itens */}
        {os.itens && os.itens.length > 0 && (
          <View style={s.card}>
            <Text style={s.secLabel}>Itens</Text>
            {os.itens.map((it, i) => (
              <View key={i} style={s.item}>
                <Text style={s.itemNome}>{it.produto_nome || it.servico_nome || it.descricao}</Text>
                <Text style={s.itemVal}>x{it.quantidade} — {fmtVal(it.subtotal)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Observações */}
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.secLabel}>Observações</Text>
            {!editandoObs && (
              <TouchableOpacity onPress={() => setEditandoObs(true)}>
                <Text style={s.editBtn}>Editar</Text>
              </TouchableOpacity>
            )}
          </View>
          {editandoObs ? (
            <>
              <TextInput
                style={s.obsInput}
                value={obs}
                onChangeText={setObs}
                multiline
                placeholder="Adicione uma observação..."
                placeholderTextColor="#999"
              />
              <View style={s.row}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setObs(os.observacoes || ''); setEditandoObs(false); }}>
                  <Text style={s.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={salvarObs} disabled={salvando}>
                  {salvando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Salvar</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={s.obsText}>{os.observacoes || 'Sem observações'}</Text>
          )}
        </View>

        {/* Botões de ação */}
        {podeAtualizar && (
          <View style={{ gap: 10 }}>
            {os.status === 'aberta' && (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#3b82f6' }]}
                onPress={() => atualizarStatus('em_andamento')}>
                <Text style={s.actionBtnText}>▶ Iniciar Serviço</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#10b981' }]}
              onPress={() => setModalStatus(true)}>
              <Text style={s.actionBtnText}>✅ Finalizar OS</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Modal de finalização */}
      <Modal visible={modalStatus} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Finalizar OS</Text>
            <Text style={s.modalSub}>Selecione a forma de pagamento:</Text>
            {['dinheiro', 'pix', 'debito', 'credito'].map(pg => (
              <TouchableOpacity key={pg} style={s.pgBtn} onPress={() => atualizarStatus('concluida', pg)} disabled={salvando}>
                <Text style={s.pgBtnText}>{PG_LABEL[pg]}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.cancelBtn2} onPress={() => setModalStatus(false)}>
              <Text style={s.cancelBtn2Text}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  numero: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  descricao: { fontSize: 14, color: '#475569', lineHeight: 20 },
  secLabel: { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  secValue: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  secSub: { fontSize: 13, color: '#64748b', marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', paddingVertical: 6 },
  gridLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' },
  gridValue: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginTop: 2 },
  item: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  itemNome: { fontSize: 14, color: '#334155', flex: 1 },
  itemVal: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  editBtn: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  obsInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12,
    fontSize: 14, color: '#333', minHeight: 80, textAlignVertical: 'top', marginBottom: 10
  },
  obsText: { fontSize: 14, color: '#475569', lineHeight: 20 },
  saveBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginRight: 8 },
  cancelBtnText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  actionBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 6 },
  modalSub: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  pgBtn: {
    backgroundColor: '#f8fafc', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0'
  },
  pgBtnText: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  cancelBtn2: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelBtn2Text: { fontSize: 15, color: '#94a3b8' },
});
