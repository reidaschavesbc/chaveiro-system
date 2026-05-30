import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import UpperTextInput from '../components/UpperTextInput';

function fmtVal(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const TEMPO_OPTS = [
  { label: 'Indefinido', value: -1 },
  { label: '30 min',     value: 30 },
  { label: '1h',         value: 60 },
  { label: '1h30',       value: 90 },
  { label: '2h',         value: 120 },
  { label: '2h30',       value: 150 },
  { label: '3h',         value: 180 },
];

const PAGAMENTO_OPTS = [
  { label: 'A definir', value: '' },
  { label: 'Dinheiro',  value: 'dinheiro' },
  { label: 'PIX',       value: 'pix' },
  { label: 'Cartão',    value: 'debito' },
  { label: 'Misto',     value: 'misto' },
];

export default function OSNovaScreen({ navigation, route }) {
  const vendedorId   = route?.params?.vendedor_id   || null;
  const vendedorNome = route?.params?.vendedor_nome || null;

  const [isPlantao, setIsPlantao]         = useState(false);
  const [chaveAuto, setChaveAuto]         = useState(false);
  const [clienteNome, setClienteNome]     = useState('');
  const [contatoCliente, setContatoCliente] = useState('');
  const [rua, setRua]                     = useState('');
  const [numero, setNumero]               = useState('');
  const [complemento, setComplemento]     = useState('');
  const [cidade, setCidade]               = useState('');
  const [referencia, setReferencia]       = useState('');
  const [descricao, setDescricao]         = useState('');
  const [valor, setValor]                 = useState('');
  const [dataPrevista, setDataPrevista]   = useState('');
  const [horaPrevista, setHoraPrevista]   = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [observacoes, setObservacoes]     = useState('');
  const [tempoEstimado, setTempoEstimado] = useState(-1);
  const [salvando, setSalvando]           = useState(false);

  const [isAdmin, setIsAdmin]                 = useState(false);
  const [disponibilidade, setDisponibilidade] = useState([]);
  const [loadingDisp, setLoadingDisp]         = useState(false);

  const [itens, setItens] = useState([]);

  useEffect(() => { carregarDisponibilidade(); }, []);

  async function carregarDisponibilidade() {
    const f = await AsyncStorage.getItem('funcionario');
    const func = f ? JSON.parse(f) : null;
    if (!func?.is_admin) return;
    setIsAdmin(true);
    setLoadingDisp(true);
    try {
      const params = func.loja_id ? { loja_id: func.loja_id } : {};
      const { data } = await api.get('/disponibilidade', { params });
      setDisponibilidade(data);
    } catch (_) {}
    finally { setLoadingDisp(false); }
  }

  // Modal catálogo
  const [modalTipo, setModalTipo] = useState(null);
  const [catalogo, setCatalogo]   = useState([]);
  const [loadingCat, setLoadingCat] = useState(false);
  const [busca, setBusca]         = useState('');
  const [itemSel, setItemSel]     = useState(null);
  const [qtdInput, setQtdInput]   = useState('1');
  const [precoInput, setPrecoInput] = useState('');

  async function abrirModal(tipo) {
    setModalTipo(tipo); setBusca(''); setItemSel(null); setQtdInput('1'); setPrecoInput('');
    setLoadingCat(true);
    try {
      const { data } = await api.get(tipo === 'servico' ? '/servicos' : '/produtos');
      setCatalogo(data);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar o catálogo');
      setModalTipo(null);
    } finally { setLoadingCat(false); }
  }

  function fecharModal() { setModalTipo(null); setCatalogo([]); setItemSel(null); setBusca(''); }

  function selecionarItem(item) {
    setItemSel(item); setQtdInput('1');
    setPrecoInput(String(item.preco_venda ?? item.preco_base ?? '0'));
  }

  function confirmarItem() {
    if (!itemSel) return;
    const qty   = parseFloat(qtdInput.replace(',', '.'))   || 1;
    const preco = parseFloat(precoInput.replace(',', '.')) || 0;
    setItens(prev => [...prev, { tipo: modalTipo, id: itemSel.id, nome: itemSel.nome, quantidade: qty, preco, subtotal: qty * preco }]);
    fecharModal();
  }

  function removerItem(idx) { setItens(prev => prev.filter((_, i) => i !== idx)); }

  const catalogoFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? catalogo.filter(i => i.nome.toLowerCase().includes(q)) : catalogo;
  }, [busca, catalogo]);

  const totalItens = itens.reduce((s, i) => s + i.subtotal, 0);

  const precoSubtotal = useMemo(() => {
    const q = parseFloat(qtdInput.replace(',', '.')) || 0;
    const p = parseFloat(precoInput.replace(',', '.')) || 0;
    return q * p;
  }, [qtdInput, precoInput]);

  async function criar() {
    if (!isPlantao && !descricao.trim()) {
      Alert.alert('Atenção', 'Informe a descrição do serviço'); return;
    }
    if (isPlantao && !rua.trim()) {
      Alert.alert('Atenção', 'Informe o endereço do plantão'); return;
    }
    setSalvando(true);
    try {
      let dp = null;
      if (dataPrevista.trim()) {
        dp = dataPrevista.trim() + (horaPrevista.trim() ? ' ' + horaPrevista.trim() : '');
      }
      const { data } = await api.post('/os', {
        cliente_nome_avulso:        clienteNome.trim()      || null,
        cliente_avulso_rua:         rua.trim()              || null,
        cliente_avulso_numero:      numero.trim()           || null,
        cliente_avulso_complemento: complemento.trim()      || null,
        cliente_avulso_cidade:      cidade.trim()           || null,
        cliente_avulso_referencia:  referencia.trim()       || null,
        descricao:                  descricao.trim()        || null,
        contato_cliente:            contatoCliente.trim()   || null,
        valor:                      parseFloat(valor.replace(',', '.')) || 0,
        data_prevista:              dp,
        forma_pagamento:            formaPagamento          || null,
        observacoes:                observacoes.trim()      || null,
        is_plantao:  isPlantao,
        chave_auto:  chaveAuto,
        vendedor_id: vendedorId,
        tempo_estimado: tempoEstimado,
      });

      for (const item of itens) {
        await api.post(`/os/${data.id}/item`, {
          produto_id:     item.tipo === 'produto' ? item.id : null,
          servico_id:     item.tipo === 'servico' ? item.id : null,
          descricao:      item.nome,
          quantidade:     item.quantidade,
          preco_unitario: item.preco,
        });
      }

      navigation.replace('OSDetalhe', { osId: data.id });
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Não foi possível criar a OS');
    } finally { setSalvando(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {vendedorNome && (
          <View style={s.funcBanner}>
            <Text style={s.funcBannerText}>👤 Para: <Text style={{ fontWeight: '700' }}>{vendedorNome}</Text></Text>
          </View>
        )}

        {/* Disponibilidade — só ADM */}
        {isAdmin && (loadingDisp || disponibilidade.length > 0) && (
          <View style={s.dispCard}>
            <Text style={s.dispTitulo}>Disponibilidade agora</Text>
            {loadingDisp
              ? <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 4 }} />
              : disponibilidade.map(v => (
                  <View key={v.id} style={s.dispRow}>
                    <Text style={v.status === 'livre' ? s.dispDotLivre : s.dispDotOcupado}>●</Text>
                    <Text style={s.dispNome}>{v.nome}</Text>
                    <Text style={v.status === 'livre' ? s.dispLivre : s.dispOcupado}>
                      {v.status === 'livre' ? 'livre' : v.livre_as ? `ocupado até ${v.livre_as}` : 'ocupado (sem previsão)'}
                    </Text>
                  </View>
                ))
            }
          </View>
        )}

        {/* Toggles */}
        <View style={s.togglesCard}>
          <View style={s.toggleRow}>
            <View>
              <Text style={s.plantaoLabel}>🌙 Plantão</Text>
              <Text style={s.toggleSub}>Não exige serviço, só endereço</Text>
            </View>
            <Switch value={isPlantao} onValueChange={v => { setIsPlantao(v); if (v) setChaveAuto(false); }}
              trackColor={{ false: '#e2e8f0', true: '#7c3aed' }} thumbColor="#fff" />
          </View>
          {!isPlantao && (
            <View style={[s.toggleRow, s.toggleSep]}>
              <View>
                <Text style={s.chaveLabel}>🔑 Chave Auto</Text>
                <Text style={s.toggleSub}>OS de chave automotiva</Text>
              </View>
              <Switch value={chaveAuto} onValueChange={setChaveAuto}
                trackColor={{ false: '#e2e8f0', true: '#f59e0b' }} thumbColor="#fff" />
            </View>
          )}
        </View>

        {/* Cliente */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Cliente</Text>
          <Text style={s.fieldLabel}>Nome do cliente</Text>
          <UpperTextInput style={s.input} placeholder="Opcional" value={clienteNome} onChangeText={setClienteNome} />
          <Text style={s.fieldLabel}>📞 Contato desta OS (tel/WhatsApp — opcional)</Text>
          <TextInput style={s.input} placeholder="Opcional" value={contatoCliente} onChangeText={setContatoCliente} keyboardType="phone-pad" />
        </View>

        {/* Endereço */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Endereço{isPlantao ? ' *' : ' (opcional)'}</Text>
          <Text style={s.fieldLabel}>Rua / Avenida</Text>
          <UpperTextInput style={s.input} placeholder="Ex: Rua das Flores" value={rua} onChangeText={setRua} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Número</Text>
              <TextInput style={s.input} placeholder="Ex: 123" value={numero} onChangeText={setNumero} keyboardType="numeric" />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={s.fieldLabel}>Complemento</Text>
              <UpperTextInput style={s.input} placeholder="Apto, bloco..." value={complemento} onChangeText={setComplemento} />
            </View>
          </View>
          <Text style={s.fieldLabel}>Cidade</Text>
          <UpperTextInput style={s.input} placeholder="Ex: São Paulo" value={cidade} onChangeText={setCidade} />
          <Text style={s.fieldLabel}>Referência</Text>
          <UpperTextInput style={s.input} placeholder="Perto de, cor da casa..." value={referencia} onChangeText={setReferencia} />
        </View>

        {/* Descrição */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>{isPlantao ? 'Observação (opcional)' : 'Descrição do Problema / Serviço *'}</Text>
          <UpperTextInput
            style={[s.input, s.textarea]}
            placeholder={isPlantao ? 'Ex: cliente solicitou abertura de porta...' : 'Ex: troca de cilindro, cópia de chave...'}
            value={descricao} onChangeText={setDescricao}
            multiline numberOfLines={3} textAlignVertical="top"
          />
        </View>

        {/* Valor e Data */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Valor e Previsão</Text>
          <Text style={s.fieldLabel}>Valor (R$)</Text>
          <TextInput style={s.input} placeholder="0,00" value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
          <Text style={s.fieldLabel}>Data/Hora Prevista</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="AAAA-MM-DD" value={dataPrevista} onChangeText={setDataPrevista} />
            <TextInput style={[s.input, { width: 90 }]} placeholder="HH:MM" value={horaPrevista} onChangeText={setHoraPrevista} />
          </View>
        </View>

        {/* Forma de Pagamento */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Forma de Pagamento</Text>
          <View style={s.chips}>
            {PAGAMENTO_OPTS.map(o => (
              <TouchableOpacity key={o.value} style={[s.chip, formaPagamento === o.value && s.chipAtivo]}
                onPress={() => setFormaPagamento(o.value)}>
                <Text style={[s.chipText, formaPagamento === o.value && s.chipTextAtivo]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Observações */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Observações</Text>
          <UpperTextInput
            style={[s.input, s.textarea]}
            placeholder="Observações adicionais..."
            value={observacoes} onChangeText={setObservacoes}
            multiline numberOfLines={2} textAlignVertical="top"
          />
        </View>

        {/* Tempo estimado */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Tempo Estimado do Serviço</Text>
          <View style={s.chips}>
            {TEMPO_OPTS.map(o => (
              <TouchableOpacity key={o.value} style={[s.chip, tempoEstimado === o.value && s.chipAtivo]}
                onPress={() => setTempoEstimado(o.value)}>
                <Text style={[s.chipText, tempoEstimado === o.value && s.chipTextAtivo]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Serviços e Produtos */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Serviços e Produtos</Text>
          {itens.map((item, idx) => (
            <View key={idx} style={s.itemRow}>
              <Text style={s.itemIcon}>{item.tipo === 'servico' ? '🔧' : '📦'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.itemNome}>{item.nome}</Text>
                <Text style={s.itemSub}>{item.quantidade}x {fmtVal(item.preco)} = {fmtVal(item.subtotal)}</Text>
              </View>
              <TouchableOpacity onPress={() => removerItem(idx)} style={s.removerBtn}>
                <Text style={s.removerText}>🗑</Text>
              </TouchableOpacity>
            </View>
          ))}
          {itens.length > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total estimado</Text>
              <Text style={s.totalVal}>{fmtVal(totalItens)}</Text>
            </View>
          )}
          <View style={s.addBtns}>
            <TouchableOpacity style={s.addBtn} onPress={() => abrirModal('servico')}>
              <Text style={s.addBtnText}>🔧 + Serviço</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtn, s.addBtnProduto]} onPress={() => abrirModal('produto')}>
              <Text style={s.addBtnText}>📦 + Produto</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[s.btnCriar, isPlantao && s.btnCriarPlantao, salvando && { opacity: 0.6 }]}
          onPress={criar} disabled={salvando}>
          {salvando
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnCriarText}>{isPlantao ? '🌙 Criar Plantão' : 'Criar OS'}</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal catálogo */}
      <Modal visible={!!modalTipo} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitulo}>
                {itemSel ? itemSel.nome : modalTipo === 'servico' ? '🔧 Adicionar Serviço' : '📦 Adicionar Produto'}
              </Text>
              <TouchableOpacity onPress={fecharModal} style={s.modalFecharBtn}>
                <Text style={s.modalFecharText}>✕</Text>
              </TouchableOpacity>
            </View>

            {!itemSel ? (
              <>
                <TextInput style={s.buscaInput} placeholder="Buscar por nome..."
                  value={busca} onChangeText={setBusca} autoFocus clearButtonMode="while-editing" />
                {loadingCat
                  ? <ActivityIndicator style={{ marginTop: 32 }} color="#7c3aed" />
                  : <FlatList data={catalogoFiltrado} keyExtractor={i => String(i.id)} style={{ flex: 1 }}
                      keyboardShouldPersistTaps="handled"
                      ListEmptyComponent={<Text style={s.vazio}>Nenhum resultado</Text>}
                      renderItem={({ item }) => (
                        <TouchableOpacity style={s.catalogoItem} onPress={() => selecionarItem(item)}>
                          <Text style={s.catalogoNome}>{item.nome}</Text>
                          <Text style={s.catalogoPreco}>{fmtVal(item.preco_venda ?? item.preco_base)}</Text>
                        </TouchableOpacity>
                      )}
                      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />}
                    />
                }
              </>
            ) : (
              <View style={{ flex: 1 }}>
                <TouchableOpacity onPress={() => setItemSel(null)} style={s.voltarBtn}>
                  <Text style={s.voltarText}>‹ Voltar à busca</Text>
                </TouchableOpacity>
                <Text style={s.configLabel}>Quantidade</Text>
                <TextInput style={s.configInput} value={qtdInput} onChangeText={setQtdInput}
                  keyboardType="decimal-pad" selectTextOnFocus />
                <Text style={s.configLabel}>Preço unitário (R$)</Text>
                <TextInput style={s.configInput} value={precoInput} onChangeText={setPrecoInput}
                  keyboardType="decimal-pad" selectTextOnFocus />
                {precoSubtotal > 0 && <Text style={s.configSubtotal}>Subtotal: {fmtVal(precoSubtotal)}</Text>}
                <TouchableOpacity style={s.confirmarBtn} onPress={confirmarItem}>
                  <Text style={s.confirmarBtnText}>Adicionar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  funcBanner: { backgroundColor: '#ede9fe', borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#7c3aed' },
  funcBannerText: { fontSize: 14, color: '#5b21b6' },

  dispCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14, elevation: 1 },
  dispTitulo: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  dispRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dispDotLivre: { fontSize: 14, color: '#10b981' },
  dispDotOcupado: { fontSize: 14, color: '#ef4444' },
  dispNome: { fontSize: 14, fontWeight: '600', color: '#1e293b', flex: 1 },
  dispLivre: { fontSize: 13, color: '#10b981', fontWeight: '600' },
  dispOcupado: { fontSize: 13, color: '#ef4444', fontWeight: '600' },

  togglesCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 1 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleSep: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, marginTop: 4 },
  plantaoLabel: { fontSize: 15, fontWeight: '700', color: '#7c3aed' },
  chaveLabel:   { fontSize: 15, fontWeight: '700', color: '#b45309' },
  toggleSub:    { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  secao: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, elevation: 1 },
  secaoTitulo: { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc', marginBottom: 8 },
  textarea: { minHeight: 80 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  chipAtivo: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  chipTextAtivo: { color: '#fff' },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemIcon: { fontSize: 18 },
  itemNome: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  itemSub:  { fontSize: 12, color: '#64748b', marginTop: 2 },
  removerBtn: { padding: 6 },
  removerText: { fontSize: 18 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 2 },
  totalLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  totalVal:   { fontSize: 15, fontWeight: '800', color: '#1e293b' },

  addBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  addBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  addBtnProduto: { backgroundColor: '#7c3aed' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  btnCriar: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnCriarPlantao: { backgroundColor: '#7c3aed' },
  btnCriarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, height: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: '#1e293b', flex: 1 },
  modalFecharBtn: { padding: 4 },
  modalFecharText: { fontSize: 20, color: '#94a3b8', fontWeight: '700' },

  buscaInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 11, fontSize: 15, color: '#1e293b', backgroundColor: '#f8fafc', marginBottom: 10 },
  catalogoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 4 },
  catalogoNome:  { fontSize: 14, color: '#1e293b', flex: 1 },
  catalogoPreco: { fontSize: 14, fontWeight: '700', color: '#2563eb', marginLeft: 12 },

  voltarBtn: { marginBottom: 16 },
  voltarText: { fontSize: 14, color: '#7c3aed', fontWeight: '600' },

  configLabel: { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  configInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 18, color: '#1e293b', backgroundColor: '#f8fafc', fontWeight: '700' },
  configSubtotal: { fontSize: 15, color: '#10b981', fontWeight: '700', marginTop: 12 },

  confirmarBtn: { backgroundColor: '#2563eb', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
  confirmarBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  vazio: { textAlign: 'center', marginTop: 40, color: '#94a3b8', fontSize: 14 },
});
