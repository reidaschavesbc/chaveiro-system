import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Modal, TextInput,
  ScrollView, Alert, Platform, KeyboardAvoidingView
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
  return `${dia}/${m}/${y.slice(2)}${h ? ' ' + h : ''}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function dataHoraDefault() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return {
    dataDisplay: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`,
    hora: `${pad(d.getHours())}:00`,
  };
}

function parseDataDisplay(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length < 2) return null;
  const year = y.length === 2 ? '20' + y : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
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
  const [dataDisplay, setDataDisplay] = useState(def.dataDisplay);
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

  const abrirModal = useCallback(() => {
    const d = dataHoraDefault();
    setMensagem('');
    setDataDisplay(d.dataDisplay);
    setHora(d.hora);
    setDestTodos(true);
    setDestSelecionados([]);
    setModal(true);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginRight: 4 }}>
          <TouchableOpacity
            onPress={abrirModal}
            style={{ paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#00000015', borderRadius: 8 }}
          >
            <Text style={{ color: '#1a1a2e', fontWeight: '700', fontSize: 13 }}>+ Novo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#00000015', borderRadius: 8 }}
          >
            <Text style={{ fontSize: 13, color: '#1a1a2e', fontWeight: '700' }}>VOLTAR</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, abrirModal]);

  function toggleDest(id) {
    setDestSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function salvar() {
    if (!mensagem.trim()) { Alert.alert('Atenção', 'Digite a mensagem'); return; }
    const parsedData = parseDataDisplay(dataDisplay);
    if (!parsedData || !hora) { Alert.alert('Atenção', 'Informe a data (DD/MM/AA) e hora'); return; }
    if (isAdmin && !destTodos && destSelecionados.length === 0) {
      Alert.alert('Atenção', 'Selecione ao menos um destinatário');
      return;
    }
    const dataHoraEnvio = new Date(`${parsedData}T${hora}`);
    if (dataHoraEnvio <= new Date()) { Alert.alert('Atenção', 'A data/hora deve ser no futuro'); return; }

    const destinatarios = !isAdmin ? null : (destTodos ? 'todos' : destSelecionados.join(','));
    setSalvando(true);
    try {
      await api.post('/lembretes', { mensagem: mensagem.trim(), data_envio: `${parsedData} ${hora}`, destinatarios });
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
      <View style={[s.card, item.status === 'pendente' && s.cardPendente]}>
        <View style={s.cardTop}>
          <View style={s.cardDataRow}>
            <Text style={s.clockIcon}>🕐</Text>
            <Text style={s.cardData}>{fmtDH(item.data_envio)}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: st.bg }]}>
            <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <Text style={s.cardMsg}>{item.mensagem}</Text>
        <View style={s.cardBottom}>
          <Text style={s.cardDest} numberOfLines={1}>👤 {item.destinatarios_nomes || '—'}</Text>
          {(item.status === 'pendente' || item.status === 'enviado' || item.status === 'falha' || item.status === 'cancelado') && (
            <TouchableOpacity onPress={() => excluir(item)} style={s.excluirBtn}>
              <Text style={s.excluirText}>{item.status === 'pendente' ? '✕ Cancelar' : '🗑 Excluir'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {item.erros ? <Text style={s.erro}>⚠ {item.erros}</Text> : null}
        {item.enviado_em ? <Text style={s.enviadoEm}>✓ Enviado em {fmtDH(item.enviado_em)}</Text> : null}
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Filtros */}
      <View style={s.filtros}>
        {[['pendente', '⏳ Pendentes'], ['todos', 'Todos'], ['enviado', '✓ Enviados']].map(([v, l]) => (
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
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#f59e0b" />
      ) : (
        <FlatList
          data={lembretes}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregar(); }}
              tintColor="#f59e0b"
            />
          }
          ListEmptyComponent={
            <View style={s.vazioCont}>
              <Text style={s.vazioIcon}>🔔</Text>
              <Text style={s.vazio}>Nenhum lembrete encontrado</Text>
              <Text style={s.vazioSub}>Toque em "+ Novo" para criar um lembrete</Text>
            </View>
          }
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        />
      )}

      {/* Modal novo lembrete */}
      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setModal(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%' }}
          >
            <View style={[s.modalBox, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
              <View style={s.dragHandle} />
              <Text style={s.modalTitulo}>🔔 Novo Lembrete</Text>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={s.label}>Mensagem *</Text>
                <TextInput
                  style={s.textarea}
                  multiline
                  numberOfLines={3}
                  placeholder="Digite o lembrete..."
                  placeholderTextColor="#94a3b8"
                  value={mensagem}
                  onChangeText={setMensagem}
                />

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Data *</Text>
                    <TextInput
                      style={s.input}
                      placeholder="DD/MM/AA"
                      placeholderTextColor="#94a3b8"
                      value={dataDisplay}
                      onChangeText={setDataDisplay}
                      keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Hora *</Text>
                    <TextInput
                      style={s.input}
                      placeholder="HH:MM"
                      placeholderTextColor="#94a3b8"
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
                        style={[s.destRow, destTodos && s.destRowAtivo]}
                        onPress={() => { setDestTodos(true); setDestSelecionados([]); }}
                      >
                        <View style={[s.radio, destTodos && s.radioAtivo]}>
                          {destTodos && <View style={s.radioInner} />}
                        </View>
                        <Text style={[s.destNome, destTodos && { color: '#2563eb', fontWeight: '700' }]}>
                          Todos os funcionários
                        </Text>
                      </TouchableOpacity>
                      <View style={s.separator} />
                      {vendedores.map(v => {
                        const sel = !destTodos && destSelecionados.includes(String(v.id));
                        return (
                          <TouchableOpacity
                            key={v.id}
                            style={[s.destRow, sel && s.destRowAtivo]}
                            onPress={() => { setDestTodos(false); toggleDest(String(v.id)); }}
                          >
                            <View style={[s.checkbox, sel && s.checkboxAtivo]}>
                              {sel && <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>}
                            </View>
                            <Text style={[s.destNome, sel && { color: '#2563eb' }]}>{v.nome}</Text>
                            {v.telefone
                              ? <Text style={s.destTel}>{v.telefone}</Text>
                              : <Text style={s.destSemTel}>sem tel.</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <View style={[s.destBox, { marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                    <Text style={{ fontSize: 20 }}>👤</Text>
                    <Text style={{ fontSize: 13, color: '#475569', flex: 1 }}>
                      O lembrete será enviado para você no WhatsApp
                    </Text>
                  </View>
                )}

                <View style={s.modalBtns}>
                  <TouchableOpacity style={s.cancelarBtn} onPress={() => setModal(false)}>
                    <Text style={s.cancelarText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.salvarBtn, salvando && { opacity: 0.6 }]}
                    onPress={salvar}
                    disabled={salvando}
                  >
                    <Text style={s.salvarText}>{salvando ? 'Salvando...' : '📅 Agendar'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  filtros: {
    flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
  },
  filtroBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  filtroBtnAtivo: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  filtroText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  filtroTextAtivo: { color: '#fff' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 15, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08,
    borderLeftWidth: 4, borderLeftColor: '#e2e8f0',
  },
  cardPendente: { borderLeftColor: '#f59e0b' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardDataRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clockIcon: { fontSize: 12 },
  cardData: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardMsg: { fontSize: 14, color: '#334155', lineHeight: 20, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDest: { flex: 1, fontSize: 12, color: '#64748b', marginRight: 10 },
  excluirBtn: { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: '#fee2e2', borderRadius: 8 },
  excluirText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  erro: { marginTop: 6, fontSize: 11, color: '#ef4444' },
  enviadoEm: { marginTop: 4, fontSize: 11, color: '#10b981' },
  vazioCont: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  vazioIcon: { fontSize: 48, marginBottom: 12 },
  vazio: { textAlign: 'center', color: '#64748b', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  vazioSub: { textAlign: 'center', color: '#94a3b8', fontSize: 13 },
  // Modal
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingTop: 12, maxHeight: '92%',
    elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.15,
  },
  dragHandle: {
    width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitulo: { fontSize: 19, fontWeight: '700', color: '#1e293b', marginBottom: 20 },
  label: {
    fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
  textarea: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 12,
    fontSize: 14, minHeight: 85, textAlignVertical: 'top', marginBottom: 14,
    backgroundColor: '#fafafa', color: '#1e293b',
  },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 12,
    fontSize: 14, backgroundColor: '#fafafa', color: '#1e293b',
  },
  destBox: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 10,
    marginBottom: 20, backgroundColor: '#fafafa',
  },
  destRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8,
  },
  destRowAtivo: { backgroundColor: '#eff6ff' },
  destNome: { flex: 1, fontSize: 13, color: '#374151' },
  destTel: { fontSize: 11, color: '#94a3b8' },
  destSemTel: { fontSize: 11, color: '#ef4444' },
  separator: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 4 },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  radioAtivo: { borderColor: '#2563eb' },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563eb' },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxAtivo: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8 },
  cancelarBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f1f5f9',
    alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0',
  },
  cancelarText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  salvarBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f59e0b',
    alignItems: 'center', elevation: 3,
    shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4,
  },
  salvarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
