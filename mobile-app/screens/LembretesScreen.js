import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Modal, TextInput,
  ScrollView, Alert, Platform
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const STATUS = {
  pendente:  { label: 'Pendente',  bg: '#fef3c7', color: '#92400e' },
  enviado:   { label: 'Enviado',   bg: '#d1fae5', color: '#065f46' },
  falha:     { label: 'Falha',     bg: '#fee2e2', color: '#991b1b' },
  cancelado: { label: 'Cancelado', bg: '#f1f5f9', color: '#475569' },
};

function fmtDH(dt) {
  if (!dt) return '—';
  const s = String(dt).slice(0, 16);
  const [d, h] = s.split(' ');
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}${h ? ' ' + h : ''}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function dataHoraDefault() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return {
    data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:00`,
  };
}

export default function LembretesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [isAdmin, setIsAdmin] = useState(false);
  const [lembretes, setLembretes] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState('pendente');
  const [modal, setModal] = useState(false);

  const def = dataHoraDefault();
  const [mensagem, setMensagem] = useState('');
  const [data, setData] = useState(def.data);
  const [hora, setHora] = useState(def.hora);
  const [destTodos, setDestTodos] = useState(true);
  const [destSelecionados, setDestSelecionados] = useState([]);
  const [salvando, setSalvando] = useState(false);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('funcionario').then(f => {
      if (f) setIsAdmin(JSON.parse(f).is_admin || false);
    });
    carregar();
  }, [filtro]));

  async function carregar() {
    try {
      const params = filtro !== 'todos' ? { status: filtro } : {};
      const { data: resp } = await api.get('/lembretes', { params });
      setLembretes(resp.lembretes || []);
      setVendedores(resp.vendedores || []);
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao carregar lembretes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function abrirModal() {
    const d = dataHoraDefault();
    setMensagem('');
    setData(d.data);
    setHora(d.hora);
    setDestTodos(true);
    setDestSelecionados([]);
    setModal(true);
  }

  function toggleDest(id) {
    setDestSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function salvar() {
    if (!mensagem.trim()) { Alert.alert('Atenção', 'Digite a mensagem'); return; }
    if (!data || !hora) { Alert.alert('Atenção', 'Informe data e hora'); return; }
    if (isAdmin && !destTodos && destSelecionados.length === 0) {
      Alert.alert('Atenção', 'Selecione ao menos um destinatário');
      return;
    }
    const dataHoraEnvio = new Date(`${data}T${hora}`);
    if (dataHoraEnvio <= new Date()) { Alert.alert('Atenção', 'A data/hora deve ser no futuro'); return; }

    const destinatarios = !isAdmin ? null : (destTodos ? 'todos' : destSelecionados.join(','));
    setSalvando(true);
    try {
      await api.post('/lembretes', { mensagem: mensagem.trim(), data_envio: `${data} ${hora}`, destinatarios });
      setModal(false);
      setFiltro('pendente');
      setLoading(true);
      await carregar();
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(item) {
    const acao = item.status === 'pendente' ? 'cancelar' : 'excluir';
    Alert.alert('Confirmar', `Deseja ${acao} este lembrete?`, [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/lembretes/${item.id}`);
            await carregar();
          } catch (e) {
            Alert.alert('Erro', e.response?.data?.error || 'Falha');
          }
        }
      }
    ]);
  }

  function renderItem({ item }) {
    const st = STATUS[item.status] || STATUS.pendente;
    return (
      <View style={[s.card, item.status === 'pendente' && { borderLeftWidth: 3, borderLeftColor: '#f59e0b' }]}>
        <View style={s.cardTop}>
          <Text style={s.cardData}>{fmtDH(item.data_envio)}</Text>
          <View style={[s.badge, { backgroundColor: st.bg }]}>
            <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <Text style={s.cardMsg}>{item.mensagem}</Text>
        <View style={s.cardBottom}>
          <Text style={s.cardDest} numberOfLines={1}>{item.destinatarios_nomes || '—'}</Text>
          {(item.status === 'pendente' || item.status === 'enviado' || item.status === 'falha' || item.status === 'cancelado') && (
            <TouchableOpacity onPress={() => excluir(item)} style={s.excluirBtn}>
              <Text style={s.excluirText}>{item.status === 'pendente' ? '✕ Cancelar' : '🗑 Excluir'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {item.erros ? <Text style={s.erro}>⚠ {item.erros}</Text> : null}
        {item.enviado_em ? <Text style={s.enviadoEm}>Enviado em {fmtDH(item.enviado_em)}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Lembretes</Text>
        <TouchableOpacity onPress={abrirModal} style={s.novoBtn}>
          <Text style={s.novoBtnText}>+ Novo</Text>
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View style={s.filtros}>
        {[['pendente', 'Pendentes'], ['todos', 'Todos'], ['enviado', 'Enviados']].map(([v, l]) => (
          <TouchableOpacity
            key={v}
            style={[s.filtroBtn, filtro === v && s.filtroBtnAtivo]}
            onPress={() => { setFiltro(v); setLoading(true); }}
          >
            <Text style={[s.filtroText, filtro === v && s.filtroTextAtivo]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#f59e0b" />
      ) : (
        <FlatList
          data={lembretes}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} />}
          ListEmptyComponent={<Text style={s.vazio}>Nenhum lembrete encontrado</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        />
      )}

      {/* Modal novo lembrete */}
      <Modal visible={modal} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitulo}>Novo Lembrete</Text>

            <Text style={s.label}>Mensagem *</Text>
            <TextInput
              style={s.textarea}
              multiline
              numberOfLines={3}
              placeholder="Digite o lembrete..."
              value={mensagem}
              onChangeText={setMensagem}
            />

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Data *</Text>
                <TextInput
                  style={s.input}
                  placeholder="AAAA-MM-DD"
                  value={data}
                  onChangeText={setData}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Hora *</Text>
                <TextInput
                  style={s.input}
                  placeholder="HH:MM"
                  value={hora}
                  onChangeText={setHora}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                />
              </View>
            </View>

            {isAdmin ? (
              <>
                <Text style={s.label}>Enviar para *</Text>
                <View style={s.destBox}>
                  <TouchableOpacity
                    style={s.destRow}
                    onPress={() => { setDestTodos(true); setDestSelecionados([]); }}
                  >
                    <View style={[s.radio, destTodos && s.radioAtivo]} />
                    <Text style={[s.destNome, { fontWeight: '700', color: '#2563eb' }]}>Todos os funcionários</Text>
                  </TouchableOpacity>
                  <View style={s.separator} />
                  <ScrollView style={{ maxHeight: 160 }}>
                    {vendedores.map(v => (
                      <TouchableOpacity
                        key={v.id}
                        style={[s.destRow, destTodos && { opacity: 0.4 }]}
                        disabled={destTodos}
                        onPress={() => { setDestTodos(false); toggleDest(String(v.id)); }}
                      >
                        <View style={[s.checkbox, !destTodos && destSelecionados.includes(String(v.id)) && s.checkboxAtivo]}>
                          {!destTodos && destSelecionados.includes(String(v.id)) && <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>}
                        </View>
                        <Text style={s.destNome}>{v.nome}</Text>
                        {v.telefone
                          ? <Text style={s.destTel}>{v.telefone}</Text>
                          : <Text style={s.destSemTel}>sem telefone</Text>}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </>
            ) : (
              <View style={[s.destBox, { marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <Text style={{ fontSize: 18 }}>👤</Text>
                <Text style={{ fontSize: 13, color: '#475569' }}>O lembrete será enviado para você no WhatsApp</Text>
              </View>
            )}

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelarBtn} onPress={() => setModal(false)}>
                <Text style={s.cancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.salvarBtn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
                <Text style={s.salvarText}>{salvando ? 'Salvando...' : 'Agendar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: {
    backgroundColor: '#1a1a2e', paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  backBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  backText: { color: '#94a3b8', fontSize: 14 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  novoBtn: { backgroundColor: '#f59e0b', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
  novoBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filtros: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filtroBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  filtroBtnAtivo: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  filtroText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  filtroTextAtivo: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardData: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  badge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardMsg: { fontSize: 13, color: '#334155', lineHeight: 19, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDest: { flex: 1, fontSize: 12, color: '#64748b', marginRight: 10 },
  excluirBtn: { paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#fee2e2', borderRadius: 6 },
  excluirText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  erro: { marginTop: 6, fontSize: 11, color: '#ef4444' },
  enviadoEm: { marginTop: 4, fontSize: 11, color: '#94a3b8' },
  vazio: { textAlign: 'center', marginTop: 60, color: '#94a3b8', fontSize: 15 },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitulo: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  textarea: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 14 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 14 },
  destBox: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 20 },
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  destNome: { flex: 1, fontSize: 13, color: '#374151' },
  destTel: { fontSize: 11, color: '#94a3b8' },
  destSemTel: { fontSize: 11, color: '#ef4444' },
  separator: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 6 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#cbd5e1' },
  radioAtivo: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  checkboxAtivo: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelarBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelarText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  salvarBtn: { flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: '#f59e0b', alignItems: 'center' },
  salvarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
