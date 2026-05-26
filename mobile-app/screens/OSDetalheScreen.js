import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Dimensions, Linking, Animated
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import UpperTextInput from '../components/UpperTextInput';

const STATUS_LABEL = {
  aberta:       { label: 'Aberta',       color: '#f59e0b' },
  em_andamento: { label: 'Em andamento', color: '#3b82f6' },
  concluida:    { label: 'Concluída',    color: '#10b981' },
  cancelada:    { label: 'Cancelada',    color: '#ef4444' },
};

const METODOS = [
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'pix',      label: 'PIX' },
  { key: 'debito',   label: 'Débito' },
  { key: 'credito',  label: 'Crédito' },
];

const PG_LABEL = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', misto: 'Misto', a_receber: 'A Receber' };

function fmtData(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dia] = s.split('-');
  return `${dia}/${m}/${y}`;
}

function fmtVal(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function maskDate(text) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDateBR(s) {
  if (!s || s.length !== 10) return null;
  const [d, m, y] = s.split('/');
  if (!d || !m || !y) return null;
  return `${y}-${m}-${d}`;
}

export default function OSDetalheScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { osId } = route.params;
  const [os, setOs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Toast customizado
  const [toast, setToast] = useState(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef(null);
  const scrollRef = useRef(null);

  function showToast({ icon, title, subtitle, color }) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ icon, title, subtitle, color });
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToast(null));
    }, 5000);
  }

  // Edição descrição
  const [desc, setDesc] = useState('');
  const [editandoDesc, setEditandoDesc] = useState(false);

  // Edição observações
  const [obs, setObs] = useState('');
  const [editandoObs, setEditandoObs] = useState(false);

  // Edição desconto
  const [desconto, setDesconto] = useState('');
  const [editandoDesconto, setEditandoDesconto] = useState(false);

  // Edição endereço
  const [endRua, setEndRua] = useState('');
  const [endNumero, setEndNumero] = useState('');
  const [endCidade, setEndCidade] = useState('');
  const [editandoEnd, setEditandoEnd] = useState(false);

  // Edição contato
  const [contato, setContato] = useState('');
  const [editandoContato, setEditandoContato] = useState(false);

  // Modal adicionar item
  const [modalItem, setModalItem] = useState(false);
  const [tabItem, setTabItem] = useState('produto');
  const [produtos, setProdutos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [buscaProd, setBuscaProd] = useState('');
  const [buscaServ, setBuscaServ] = useState('');
  const [itemSel, setItemSel] = useState(null);
  const [itemQtd, setItemQtd] = useState('1');
  const [itemPreco, setItemPreco] = useState('');
  const [itemDescManual, setItemDescManual] = useState('');
  const [loadingItens, setLoadingItens] = useState(false);

  // Modal finalizar
  const [modalFinalizar, setModalFinalizar] = useState(false);
  const [pagamentos, setPagamentos] = useState([{ metodo: 'pix', valor: '' }]);
  const [aReceber, setAReceber] = useState(false);
  const [dataVencimento, setDataVencimento] = useState('');

  // Modal edição de item
  const [modalEditItem, setModalEditItem] = useState(false);
  const [editandoItem, setEditandoItem] = useState(null);
  const [editItemQtd, setEditItemQtd] = useState('');
  const [editItemPreco, setEditItemPreco] = useState('');

  // Modal consumo de estoque (normal e plantão)
  const [modalEstoque, setModalEstoque] = useState(false);
  const [estoqueItens, setEstoqueItens] = useState([]);
  const [estoqueProdutos, setEstoqueProdutos] = useState([]);
  const [estoqueBusca, setEstoqueBusca] = useState('');
  const [estoqueProdSel, setEstoqueProdSel] = useState(null);
  const [estoqueQtd, setEstoqueQtd] = useState('1');
  const [osIdParaEstoque, setOsIdParaEstoque] = useState(null);
  const [estoqueModo, setEstoqueModo] = useState('normal'); // 'normal' | 'custo' | 'estoque'
  const estoqueResolveRef = React.useRef(null);

  useEffect(() => { carregarOS(); }, []);

  async function carregarOS() {
    try {
      const { data } = await api.get(`/os/${osId}`);
      setOs(data);
      setDesc(data.descricao || '');
      setObs(data.observacoes || '');
      setDesconto(data.desconto ? String(data.desconto) : '');
      setEndRua(data.cliente_avulso_rua || '');
      setEndNumero(data.cliente_avulso_numero || '');
      setEndCidade(data.cliente_avulso_cidade || '');
      setContato(data.contato_cliente || '');
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar a OS');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  // ── Edições de campo ────────────────────────────────────────────────────────

  async function salvarDescricao() {
    if (!desc.trim()) { Alert.alert('Atenção', 'Descrição não pode ser vazia'); return; }
    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, { descricao: desc.trim() });
      setOs(prev => ({ ...prev, descricao: desc.trim() }));
      setEditandoDesc(false);
    } catch { Alert.alert('Erro', 'Não foi possível salvar'); }
    finally { setSalvando(false); }
  }

  async function salvarContato() {
    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, { contato_cliente: contato.trim() || null });
      setOs(prev => ({ ...prev, contato_cliente: contato.trim() || null }));
      setEditandoContato(false);
    } catch { Alert.alert('Erro', 'Não foi possível salvar'); }
    finally { setSalvando(false); }
  }

  function abrirWhatsApp(numero) {
    const limpo = numero.replace(/\D/g, '');
    const phone = limpo.startsWith('55') ? limpo : '55' + limpo;
    Linking.openURL(`whatsapp://send?phone=${phone}`).catch(() =>
      Linking.openURL(`https://wa.me/${phone}`)
    );
  }

  async function salvarEndereco() {
    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, {
        cliente_avulso_rua: endRua.trim() || null,
        cliente_avulso_numero: endNumero.trim() || null,
        cliente_avulso_cidade: endCidade.trim() || null,
      });
      await carregarOS();
      setEditandoEnd(false);
    } catch { Alert.alert('Erro', 'Não foi possível salvar'); }
    finally { setSalvando(false); }
  }

  async function salvarObs() {
    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, { observacoes: obs });
      setOs(prev => ({ ...prev, observacoes: obs }));
      setEditandoObs(false);
    } catch { Alert.alert('Erro', 'Não foi possível salvar'); }
    finally { setSalvando(false); }
  }

  async function salvarDesconto() {
    const val = parseFloat(String(desconto).replace(',', '.')) || 0;
    setSalvando(true);
    try {
      const { data } = await api.put(`/os/${osId}`, { desconto: val });
      await carregarOS();
      setEditandoDesconto(false);
    } catch { Alert.alert('Erro', 'Não foi possível salvar'); }
    finally { setSalvando(false); }
  }

  async function atualizarStatus(novoStatus) {
    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, { status: novoStatus });
      setOs(prev => ({ ...prev, status: novoStatus }));
      showToast({ icon: '✅', title: 'OS Atualizada', subtitle: `Marcada como ${STATUS_LABEL[novoStatus]?.label}`, color: STATUS_LABEL[novoStatus]?.color || '#3b82f6' });
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao atualizar');
    } finally { setSalvando(false); }
  }

  // ── Adicionar item ──────────────────────────────────────────────────────────

  async function abrirModalItem() {
    setItemSel(null); setItemQtd('1'); setItemPreco(''); setItemDescManual('');
    setBuscaProd(''); setBuscaServ(''); setTabItem('produto');
    setModalItem(true);
    setLoadingItens(true);
    try {
      const [rP, rS] = await Promise.all([api.get('/produtos'), api.get('/servicos')]);
      setProdutos(rP.data);
      setServicos(rS.data);
    } catch { Alert.alert('Erro', 'Não foi possível carregar produtos/serviços'); }
    finally { setLoadingItens(false); }
  }

  function selecionarProduto(p) {
    setItemSel({ tipo: 'produto', id: p.id, nome: p.nome, preco: p.preco_venda });
    setItemPreco(String(p.preco_venda));
    setItemQtd('1');
  }

  function selecionarServico(s) {
    setItemSel({ tipo: 'servico', id: s.id, nome: s.nome, preco: s.preco_base });
    setItemPreco(String(s.preco_base));
    setItemQtd('1');
  }

  async function confirmarItem() {
    const qty = parseFloat(String(itemQtd).replace(',', '.')) || 1;
    const preco = parseFloat(String(itemPreco).replace(',', '.')) || 0;

    let body;
    if (tabItem === 'manual') {
      if (!itemDescManual.trim()) { Alert.alert('Atenção', 'Informe a descrição'); return; }
      body = { descricao: itemDescManual.trim(), quantidade: qty, preco_unitario: preco };
    } else if (itemSel) {
      body = {
        [itemSel.tipo === 'produto' ? 'produto_id' : 'servico_id']: itemSel.id,
        descricao: itemSel.nome,
        quantidade: qty,
        preco_unitario: preco,
      };
    } else {
      Alert.alert('Atenção', 'Selecione um item'); return;
    }

    setSalvando(true);
    try {
      await api.post(`/os/${osId}/item`, body);
      setModalItem(false);
      await carregarOS();
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao adicionar item');
    } finally { setSalvando(false); }
  }

  function iniciarEdicaoItem(it) {
    setEditandoItem(it);
    setEditItemQtd(String(it.quantidade));
    setEditItemPreco(String(it.preco_unitario));
    setModalEditItem(true);
  }

  async function salvarItemEditado() {
    const qty = parseFloat(String(editItemQtd).replace(',', '.')) || 1;
    const preco = parseFloat(String(editItemPreco).replace(',', '.')) || 0;
    setSalvando(true);
    try {
      await api.put(`/os/${osId}/item/${editandoItem.id}`, { quantidade: qty, preco_unitario: preco });
      setModalEditItem(false);
      await carregarOS();
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao editar item');
    } finally { setSalvando(false); }
  }

  async function removerItem(itemId) {
    Alert.alert('Remover item', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/os/${osId}/item/${itemId}`);
            await carregarOS();
          } catch (e) {
            Alert.alert('Erro', e.response?.data?.error || 'Falha ao remover');
          }
        }
      }
    ]);
  }

  // ── Finalizar ───────────────────────────────────────────────────────────────

  function abrirModalFinalizar() {
    const total = os.valor || 0;
    setPagamentos([{ metodo: 'pix', valor: total > 0 ? total.toFixed(2) : '' }]);
    setAReceber(false);
    setDataVencimento('');
    setModalFinalizar(true);
  }

  function adicionarPagamento() {
    setPagamentos(prev => [...prev, { metodo: 'pix', valor: '' }]);
  }

  function removerPagamento(idx) {
    setPagamentos(prev => prev.filter((_, i) => i !== idx));
  }

  function alterarPagamento(idx, campo, valor) {
    setPagamentos(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p));
  }

  async function confirmarFinalizar() {
    const total = Number(os.valor || 0);

    if (aReceber) {
      const dvEnvio = dataVencimento ? parseDateBR(dataVencimento) : null;
      setSalvando(true);
      try {
        await api.put(`/os/${osId}`, { status: 'concluida', a_receber: true, data_vencimento: dvEnvio });
        setModalFinalizar(false);
        await carregarOS();
        showToast({ icon: '✅', title: 'OS Finalizada!', subtitle: 'Marcada como A Receber.', color: '#10b981' });
        await verificarEAbrirEstoque(osId, os?.is_plantao);
      } catch (e) {
        Alert.alert('Erro', e.response?.data?.error || 'Falha ao finalizar');
      } finally { setSalvando(false); }
      return;
    }

    if (pagamentos.length === 0) { Alert.alert('Atenção', 'Adicione pelo menos uma forma de pagamento'); return; }

    const soma = pagamentos.reduce((s, p) => s + (parseFloat(String(p.valor).replace(',', '.')) || 0), 0);
    if (Math.abs(soma - total) > 0.01) {
      Alert.alert('Atenção', `Soma dos pagamentos (${fmtVal(soma)}) deve ser igual ao total (${fmtVal(total)})`);
      return;
    }

    const pags = pagamentos.map(p => ({
      metodo: p.metodo,
      valor: parseFloat(String(p.valor).replace(',', '.')) || 0,
    }));

    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, { status: 'concluida', pagamentos: pags });
      setModalFinalizar(false);
      await carregarOS();
      showToast({ icon: '✅', title: 'OS Finalizada!', subtitle: 'Pagamento registrado.', color: '#10b981' });
      await verificarEAbrirEstoque(osId, os?.is_plantao);
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao finalizar');
    } finally { setSalvando(false); }
  }

  // ── Modal consumo de estoque ────────────────────────────────────────────────

  function abrirModalEstoque(osIdLocal, modo) {
    return new Promise(resolve => {
      estoqueResolveRef.current = resolve;
      setEstoqueModo(modo || 'normal');
      setEstoqueItens([]);
      setEstoqueBusca('');
      setEstoqueProdSel(null);
      setEstoqueQtd('1');
      setOsIdParaEstoque(osIdLocal);
      setModalEstoque(true);
    });
  }

  async function verificarEAbrirEstoque(osIdLocal, isPlantao) {
    await new Promise(r => setTimeout(r, 400));

    try {
      const { data } = await api.get('/produtos');
      setEstoqueProdutos(data);
    } catch { setEstoqueProdutos([]); }

    if (isPlantao) {
      // 1º modal: material com custo
      const itensCusto = await abrirModalEstoque(osIdLocal, 'custo');
      if (itensCusto && itensCusto.length) {
        try { await api.post(`/os/${osIdLocal}/consumo-estoque`, { itens: itensCusto, registrar_custo: true }); }
        catch { Alert.alert('Erro', 'Falha ao registrar material com custo'); }
      }
      // 2º modal: retirada de estoque sem custo
      const itensEst = await abrirModalEstoque(osIdLocal, 'estoque');
      if (itensEst && itensEst.length) {
        try { await api.post(`/os/${osIdLocal}/consumo-estoque`, { itens: itensEst, registrar_custo: false }); }
        catch { Alert.alert('Erro', 'Falha ao registrar retirada de estoque'); }
      }
    } else {
      const itens = await abrirModalEstoque(osIdLocal, 'normal');
      if (itens && itens.length) {
        try { await api.post(`/os/${osIdLocal}/consumo-estoque`, { itens }); }
        catch { Alert.alert('Erro', 'Não foi possível registrar consumo'); }
      }
    }
  }

  function adicionarItemEstoque() {
    if (!estoqueProdSel) { Alert.alert('Atenção', 'Selecione um produto'); return; }
    const qtd = parseFloat(String(estoqueQtd).replace(',', '.')) || 0;
    if (qtd <= 0) { Alert.alert('Atenção', 'Informe uma quantidade válida'); return; }
    setEstoqueItens(prev => {
      const idx = prev.findIndex(i => i.produto_id === estoqueProdSel.id);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], quantidade: copia[idx].quantidade + qtd };
        return copia;
      }
      return [...prev, { produto_id: estoqueProdSel.id, nome: estoqueProdSel.nome, unidade: estoqueProdSel.unidade || 'un', quantidade: qtd }];
    });
    setEstoqueProdSel(null);
    setEstoqueQtd('1');
  }

  function fecharModalEstoque(confirmar) {
    setModalEstoque(false);
    if (estoqueResolveRef.current) {
      estoqueResolveRef.current(confirmar ? estoqueItens : []);
      estoqueResolveRef.current = null;
    }
  }

  async function confirmarConsumoEstoque() {
    fecharModalEstoque(true);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#2563eb" />;
  if (!os) return null;

  const st = STATUS_LABEL[os.status] || { label: os.status, color: '#666' };
  const podeEditar = ['aberta', 'em_andamento'].includes(os.status);
  const subtotalItens = (os.itens || []).reduce((s, it) => s + (it.subtotal || 0), 0);
  const descontoAtual = Number(os.desconto || 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16 }}>

          {/* Header */}
          <View style={[s.card, os.is_plantao ? { borderLeftWidth: 3, borderLeftColor: '#7c3aed' } : null]}>
            <View style={s.row}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.numero}>{os.numero}</Text>
                {os.is_plantao ? <Text style={{ fontSize: 11, color: '#7c3aed', backgroundColor: '#f3e8ff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, fontWeight: '700' }}>🌙 Plantão</Text> : null}
              </View>
              <View style={[s.badge, { backgroundColor: st.color + '22' }]}>
                <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={s.secLabel}>Descrição</Text>
            {editandoDesc ? (
              <>
                <UpperTextInput style={s.obsInput} value={desc} onChangeText={setDesc} multiline placeholder="Descrição do serviço" placeholderTextColor="#999" />
                <View style={s.row}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setDesc(os.descricao || ''); setEditandoDesc(false); }}>
                    <Text style={s.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={salvarDescricao} disabled={salvando}>
                    {salvando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Salvar</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity onPress={() => podeEditar && setEditandoDesc(true)}>
                <Text style={[s.descricao, podeEditar && { color: '#1e293b' }]}>{os.descricao}</Text>
                {podeEditar && <Text style={s.editLink}>Toque para editar</Text>}
              </TouchableOpacity>
            )}
          </View>

          {/* Cliente */}
          <View style={s.card}>
            <Text style={s.secLabel}>Cliente</Text>
            <Text style={s.secValue}>{os.cliente_nome}</Text>
            {os.cliente_telefone ? <Text style={s.secSub}>📞 {os.cliente_telefone}</Text> : null}

            {/* Contato da OS */}
            <View style={[s.rowSpaced, { marginTop: 8 }]}>
              <Text style={s.secLabel}>Contato desta OS</Text>
              {!editandoContato && (
                <TouchableOpacity onPress={() => setEditandoContato(true)}>
                  <Text style={s.editLink}>{os.contato_cliente ? 'Editar' : '+ Adicionar'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {editandoContato ? (
              <View>
                <TextInput
                  style={[s.obsInput, { minHeight: 0, paddingVertical: 10, marginBottom: 8 }]}
                  value={contato}
                  onChangeText={setContato}
                  placeholder="Tel / WhatsApp"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
                <View style={s.row}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setContato(os.contato_cliente || ''); setEditandoContato(false); }}>
                    <Text style={s.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={salvarContato} disabled={salvando}>
                    {salvando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Salvar</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : os.contato_cliente ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={[s.secSub, { flex: 1 }]}>📞 {os.contato_cliente}</Text>
                <TouchableOpacity
                  style={{ backgroundColor: '#25d366', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                  onPress={() => abrirWhatsApp(os.contato_cliente)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[s.secSub, { color: '#cbd5e1' }]}>Não informado</Text>
            )}

            <View style={[s.rowSpaced, { marginTop: 8 }]}>
              <Text style={s.secLabel}>Endereço</Text>
              {!editandoEnd && (
                <TouchableOpacity onPress={() => setEditandoEnd(true)}>
                  <Text style={s.editLink}>{os.cliente_endereco ? 'Editar' : '+ Adicionar'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {editandoEnd ? (
              <>
                <UpperTextInput
                  style={[s.obsInput, { minHeight: 0, paddingVertical: 10, marginBottom: 6 }]}
                  value={endRua}
                  onChangeText={setEndRua}
                  placeholder="Rua / Av."
                  placeholderTextColor="#999"
                />
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                  <TextInput
                    style={[s.obsInput, { flex: 1, minHeight: 0, paddingVertical: 10, marginBottom: 0 }]}
                    value={endNumero}
                    onChangeText={setEndNumero}
                    placeholder="Nº"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                  />
                  <UpperTextInput
                    style={[s.obsInput, { flex: 3, minHeight: 0, paddingVertical: 10, marginBottom: 0 }]}
                    value={endCidade}
                    onChangeText={setEndCidade}
                    placeholder="Cidade"
                    placeholderTextColor="#999"
                  />
                </View>
                <View style={s.row}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => {
                    setEndRua(os.cliente_avulso_rua || '');
                    setEndNumero(os.cliente_avulso_numero || '');
                    setEndCidade(os.cliente_avulso_cidade || '');
                    setEditandoEnd(false);
                  }}>
                    <Text style={s.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={salvarEndereco} disabled={salvando}>
                    {salvando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Salvar</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              (() => { const end = os.cliente_endereco || [os.cliente_avulso_rua, os.cliente_avulso_numero, os.cliente_avulso_cidade].filter(Boolean).join(', '); return end ? <Text style={s.secSub}>📍 {end}</Text> : <Text style={[s.secSub, { color: '#cbd5e1' }]}>Sem endereço</Text>; })()
            )}
          </View>

          {/* Itens */}
          <View style={s.card}>
            <View style={s.rowSpaced}>
              <Text style={s.secLabel}>Itens / Serviços</Text>
              {podeEditar && (
                <TouchableOpacity style={s.addBtn} onPress={abrirModalItem}>
                  <Text style={s.addBtnText}>+ Adicionar</Text>
                </TouchableOpacity>
              )}
            </View>
            {(os.itens || []).length === 0 ? (
              <Text style={s.emptyText}>Nenhum item adicionado</Text>
            ) : (
              os.itens.map((it, i) => (
                <View key={it.id || i} style={s.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemNome}>{it.produto_nome || it.servico_nome || it.descricao}</Text>
                    <Text style={s.itemSub}>{it.quantidade}x · {fmtVal(it.preco_unitario)}</Text>
                  </View>
                  <Text style={s.itemVal}>{fmtVal(it.subtotal)}</Text>
                  {podeEditar && (
                    <>
                      <TouchableOpacity onPress={() => iniciarEdicaoItem(it)} style={[s.removeBtn, { backgroundColor: '#eff6ff', marginRight: 6 }]}>
                        <Text style={[s.removeBtnText, { color: '#2563eb' }]}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removerItem(it.id)} style={s.removeBtn}>
                        <Text style={s.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Valores */}
          <View style={s.card}>
            <Text style={s.secLabel}>Valores</Text>
            {subtotalItens > 0 && (
              <View style={s.valRow}>
                <Text style={s.valLabel}>Subtotal</Text>
                <Text style={s.valText}>{fmtVal(subtotalItens)}</Text>
              </View>
            )}
            <View style={s.valRow}>
              <Text style={s.valLabel}>Desconto</Text>
              {editandoDesconto ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={[s.obsInput, { minHeight: 0, paddingVertical: 6, width: 100, marginBottom: 0 }]}
                    value={desconto}
                    onChangeText={setDesconto}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor="#999"
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
                  />
                  <TouchableOpacity style={[s.saveBtn, { paddingHorizontal: 12, paddingVertical: 6 }]} onPress={salvarDesconto} disabled={salvando}>
                    <Text style={s.saveBtnText}>OK</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditandoDesconto(false)}>
                    <Text style={s.editLink}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => podeEditar && setEditandoDesconto(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.valText, descontoAtual > 0 && { color: '#ef4444' }]}>
                    {descontoAtual > 0 ? `- ${fmtVal(descontoAtual)}` : fmtVal(0)}
                  </Text>
                  {podeEditar && <Text style={s.editLink}>editar</Text>}
                </TouchableOpacity>
              )}
            </View>
            <View style={[s.valRow, { borderTopWidth: 1, borderColor: '#e2e8f0', marginTop: 6, paddingTop: 8 }]}>
              <Text style={[s.valLabel, { fontWeight: '700', color: '#1e293b' }]}>Total</Text>
              <Text style={[s.valText, { fontSize: 18, fontWeight: '700', color: '#2563eb' }]}>{fmtVal(os.valor)}</Text>
            </View>
            {os.forma_pagamento && (
              <Text style={[s.secSub, { marginTop: 6 }]}>
                💳 {PG_LABEL[os.forma_pagamento] || os.forma_pagamento}
                {os.a_receber ? (os.data_vencimento ? ` · Vence ${fmtData(os.data_vencimento)}` : ' · A receber') : ''}
              </Text>
            )}
          </View>

          {/* Pagamentos registrados (se finalizado com misto) */}
          {(os.pagamentos || []).length > 1 && (
            <View style={s.card}>
              <Text style={s.secLabel}>Formas de pagamento</Text>
              {os.pagamentos.map((p, i) => (
                <View key={i} style={s.valRow}>
                  <Text style={s.valLabel}>{PG_LABEL[p.metodo] || p.metodo}</Text>
                  <Text style={s.valText}>{fmtVal(p.valor)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Datas */}
          <View style={s.card}>
            <View style={s.grid}>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>Entrada</Text>
                <Text style={s.gridValue}>{fmtData(os.data_entrada)}</Text>
              </View>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>Previsto</Text>
                <Text style={s.gridValue}>{fmtData(os.data_prevista)}</Text>
              </View>
              {os.data_conclusao && (
                <View style={s.gridItem}>
                  <Text style={s.gridLabel}>Concluído</Text>
                  <Text style={s.gridValue}>{fmtData(os.data_conclusao)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Observações */}
          <View style={s.card}>
            <View style={s.rowSpaced}>
              <Text style={s.secLabel}>Observações</Text>
              {!editandoObs && podeEditar && (
                <TouchableOpacity onPress={() => setEditandoObs(true)}>
                  <Text style={s.editLink}>Editar</Text>
                </TouchableOpacity>
              )}
            </View>
            {editandoObs ? (
              <>
                <UpperTextInput style={s.obsInput} value={obs} onChangeText={setObs} multiline placeholder="Adicione uma observação..." placeholderTextColor="#999" />
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

          {/* Ações */}
          {podeEditar && (
            <View style={{ gap: 10 }}>
              {os.status === 'aberta' && (
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#3b82f6' }]} onPress={() => atualizarStatus('em_andamento')} disabled={salvando}>
                  <Text style={s.actionBtnText}>▶ Iniciar Serviço</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#10b981' }]} onPress={abrirModalFinalizar} disabled={salvando}>
                <Text style={s.actionBtnText}>✅ Finalizar OS</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* ── Modal Adicionar Item ─────────────────────────────────────────── */}
        <Modal visible={modalItem} transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.modalOverlay, { paddingBottom: insets.bottom }]}>
            <View style={[s.modalCard, { maxHeight: Dimensions.get('window').height * 0.88, minHeight: Dimensions.get('window').height * 0.55 }]}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Adicionar Item</Text>
                <TouchableOpacity onPress={() => setModalItem(false)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Tabs */}
              <View style={s.tabBar}>
                {['produto', 'servico', 'manual'].map(t => (
                  <TouchableOpacity key={t} style={[s.tab, tabItem === t && s.tabAtivo]} onPress={() => { setTabItem(t); setItemSel(null); }}>
                    <Text style={[s.tabText, tabItem === t && s.tabTextoAtivo]}>
                      {t === 'produto' ? 'Produto' : t === 'servico' ? 'Serviço' : 'Manual'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
                {loadingItens && <ActivityIndicator style={{ margin: 20 }} color="#2563eb" />}

                {/* Tab Produto */}
                {tabItem === 'produto' && !loadingItens && (
                  <View style={{ padding: 16 }}>
                    {!itemSel ? (
                      <>
                        <UpperTextInput style={s.searchInput} value={buscaProd} onChangeText={setBuscaProd} placeholder="Buscar produto..." placeholderTextColor="#999" />
                        {produtos.filter(p => p.nome.toLowerCase().includes(buscaProd.toLowerCase())).map(p => (
                          <TouchableOpacity key={p.id} style={s.listaItem} onPress={() => selecionarProduto(p)}>
                            <Text style={s.listaItemNome}>{p.nome}</Text>
                            <Text style={s.listaItemPreco}>{fmtVal(p.preco_venda)}</Text>
                          </TouchableOpacity>
                        ))}
                        {produtos.length === 0 && <Text style={s.emptyText}>Nenhum produto cadastrado</Text>}
                      </>
                    ) : (
                      <ItemForm
                        nome={itemSel.nome} qtd={itemQtd} preco={itemPreco}
                        onQtd={setItemQtd} onPreco={setItemPreco}
                        onVoltar={() => setItemSel(null)}
                      />
                    )}
                  </View>
                )}

                {/* Tab Serviço */}
                {tabItem === 'servico' && !loadingItens && (
                  <View style={{ padding: 16 }}>
                    {!itemSel ? (
                      <>
                        <UpperTextInput style={s.searchInput} value={buscaServ} onChangeText={setBuscaServ} placeholder="Buscar serviço..." placeholderTextColor="#999" />
                        {servicos.filter(sv => sv.nome.toLowerCase().includes(buscaServ.toLowerCase())).map(sv => (
                          <TouchableOpacity key={sv.id} style={s.listaItem} onPress={() => selecionarServico(sv)}>
                            <Text style={s.listaItemNome}>{sv.nome}</Text>
                            <Text style={s.listaItemPreco}>{fmtVal(sv.preco_base)}</Text>
                          </TouchableOpacity>
                        ))}
                        {servicos.length === 0 && <Text style={s.emptyText}>Nenhum serviço cadastrado</Text>}
                      </>
                    ) : (
                      <ItemForm
                        nome={itemSel.nome} qtd={itemQtd} preco={itemPreco}
                        onQtd={setItemQtd} onPreco={setItemPreco}
                        onVoltar={() => setItemSel(null)}
                      />
                    )}
                  </View>
                )}

                {/* Tab Manual */}
                {tabItem === 'manual' && (
                  <View style={{ padding: 16 }}>
                    <Text style={s.fieldLabel}>Descrição</Text>
                    <UpperTextInput style={s.fieldInput} value={itemDescManual} onChangeText={setItemDescManual} placeholder="Ex: Troca de fechadura" placeholderTextColor="#999" />
                    <ItemForm
                      nome={null} qtd={itemQtd} preco={itemPreco}
                      onQtd={setItemQtd} onPreco={setItemPreco}
                      onVoltar={null}
                    />
                  </View>
                )}

              {(itemSel || tabItem === 'manual') && (
                <View style={[s.modalFooter, { marginHorizontal: 16, marginBottom: Math.max(insets.bottom, 8) }]}>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#2563eb' }]} onPress={confirmarItem} disabled={salvando}>
                    {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.actionBtnText}>Adicionar Item</Text>}
                  </TouchableOpacity>
                </View>
              )}
              </ScrollView>
            </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Modal Finalizar ──────────────────────────────────────────────── */}
        <Modal visible={modalFinalizar} transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.modalOverlay, { paddingBottom: insets.bottom }]}>
              <View style={[s.modalCard, { maxHeight: Dimensions.get('window').height * 0.92 }]}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Finalizar OS</Text>
                  <TouchableOpacity onPress={() => setModalFinalizar(false)}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" style={{ padding: 16 }}>
                  <View style={s.totalBox}>
                    <Text style={s.totalLabel}>Total a receber</Text>
                    <Text style={s.totalVal}>{fmtVal(os.valor)}</Text>
                  </View>

                  {/* Toggle A Receber */}
                  <TouchableOpacity style={s.toggleRow} onPress={() => setAReceber(v => !v)}>
                    <View style={[s.toggle, aReceber && s.toggleOn]}>
                      <View style={[s.toggleThumb, aReceber && s.toggleThumbOn]} />
                    </View>
                    <Text style={s.toggleLabel}>A receber (cobrar depois)</Text>
                  </TouchableOpacity>

                  {aReceber ? (
                    <View>
                      <Text style={s.fieldLabel}>Data de vencimento (opcional)</Text>
                      <TextInput
                        style={s.fieldInput}
                        value={dataVencimento}
                        onChangeText={t => setDataVencimento(maskDate(t))}
                        placeholder="DD/MM/AAAA"
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                        maxLength={10}
                      />
                    </View>
                  ) : (
                    <View>
                      <Text style={[s.secLabel, { marginBottom: 10 }]}>Formas de pagamento</Text>
                      {pagamentos.map((p, idx) => (
                        <View key={idx} style={s.pagRow}>
                          {/* Método */}
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {METODOS.map(m => (
                                <TouchableOpacity
                                  key={m.key}
                                  style={[s.metodoBtn, p.metodo === m.key && s.metodoBtnAtivo]}
                                  onPress={() => alterarPagamento(idx, 'metodo', m.key)}
                                >
                                  <Text style={[s.metodoBtnText, p.metodo === m.key && s.metodoBtnTextoAtivo]}>{m.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TextInput
                              style={[s.fieldInput, { flex: 1, marginBottom: 0 }]}
                              value={String(p.valor)}
                              onChangeText={v => alterarPagamento(idx, 'valor', v)}
                              keyboardType="decimal-pad"
                              placeholder="0,00"
                              placeholderTextColor="#999"
                            />
                            {pagamentos.length > 1 && (
                              <TouchableOpacity onPress={() => removerPagamento(idx)} style={s.removeBtn}>
                                <Text style={s.removeBtnText}>✕</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          {idx < pagamentos.length - 1 && <View style={{ borderBottomWidth: 1, borderColor: '#e2e8f0', marginVertical: 10 }} />}
                        </View>
                      ))}

                      <TouchableOpacity style={s.addPagBtn} onPress={adicionarPagamento}>
                        <Text style={s.addPagBtnText}>+ Adicionar outra forma</Text>
                      </TouchableOpacity>

                      {pagamentos.length > 1 && (
                        <View style={s.somaPag}>
                          <Text style={s.somaLabel}>Soma:</Text>
                          <Text style={s.somaVal}>
                            {fmtVal(pagamentos.reduce((s, p) => s + (parseFloat(String(p.valor).replace(',', '.')) || 0), 0))}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={[s.modalFooter, { marginHorizontal: 0, marginBottom: Math.max(insets.bottom, 8), borderTopWidth: 0 }]}>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: '#10b981' }]}
                      onPress={confirmarFinalizar}
                      disabled={salvando}
                    >
                      {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.actionBtnText}>Confirmar Finalização</Text>}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Modal Editar Item ────────────────────────────────────────── */}
        <Modal visible={modalEditItem} transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.modalOverlay, { paddingBottom: insets.bottom }]}>
              <View style={s.modalCard}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Editar Item</Text>
                  <TouchableOpacity onPress={() => setModalEditItem(false)}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ padding: 20, paddingBottom: Math.max(insets.bottom + 8, 20) }}>
                  <Text style={[s.secValue, { marginBottom: 16 }]}>{editandoItem?.produto_nome || editandoItem?.servico_nome || editandoItem?.descricao}</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>Quantidade</Text>
                      <TextInput style={s.fieldInput} value={editItemQtd} onChangeText={setEditItemQtd} keyboardType="decimal-pad" placeholder="1" placeholderTextColor="#999" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>Preço (R$)</Text>
                      <TextInput style={s.fieldInput} value={editItemPreco} onChangeText={setEditItemPreco} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor="#999" />
                    </View>
                  </View>
                  {(() => {
                    const q = parseFloat(String(editItemQtd).replace(',', '.')) || 0;
                    const p = parseFloat(String(editItemPreco).replace(',', '.')) || 0;
                    if (q > 0 && p > 0) return <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Subtotal: {fmtVal(q * p)}</Text>;
                    return <View style={{ marginBottom: 16 }} />;
                  })()}
                  <View style={s.row}>
                    <TouchableOpacity style={s.cancelBtn} onPress={() => setModalEditItem(false)}>
                      <Text style={s.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.saveBtn} onPress={salvarItemEditado} disabled={salvando}>
                      {salvando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Salvar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Modal Consumo de Estoque ─────────────────────────────────── */}
        <Modal visible={modalEstoque} transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.modalOverlay, { paddingBottom: insets.bottom }]}>
            <View style={[s.modalCard, { height: Dimensions.get('window').height * 0.85 }]}>
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, estoqueModo === 'custo' ? { color: '#7c3aed' } : estoqueModo === 'estoque' ? { color: '#475569' } : {}]}>
                  {estoqueModo === 'custo' ? '💰 Material com custo' : estoqueModo === 'estoque' ? '📦 Retirada de estoque' : '📦 Consumo de Estoque'}
                </Text>
                <TouchableOpacity onPress={() => fecharModalEstoque(false)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, padding: 16 }}>
                <Text style={[s.secSub, { marginBottom: 12 }]}>
                  {estoqueModo === 'custo'
                    ? 'Material usado no plantão — abate do estoque e do lucro.'
                    : estoqueModo === 'estoque'
                    ? 'Material retirado do estoque — sem impacto financeiro.'
                    : 'Houve uso de materiais do estoque nesta OS?'}
                </Text>

                {estoqueItens.map((it, i) => (
                  <View key={i} style={s.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemNome}>{it.nome}</Text>
                      <Text style={s.itemSub}>{it.quantidade} {it.unidade}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setEstoqueItens(prev => prev.filter((_, idx) => idx !== i))} style={s.removeBtn}>
                      <Text style={s.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 8 }}>
                  <Text style={[s.secLabel, { marginBottom: 8 }]}>Adicionar produto</Text>
                  <UpperTextInput
                    style={s.searchInput}
                    value={estoqueBusca}
                    onChangeText={setEstoqueBusca}
                    placeholder="Buscar produto..."
                    placeholderTextColor="#999"
                  />
                  {!estoqueProdSel ? (
                    estoqueProdutos
                      .filter(p => p.nome.toLowerCase().includes(estoqueBusca.toLowerCase()))
                      .slice(0, 15)
                      .map(p => (
                        <TouchableOpacity key={p.id} style={s.listaItem} onPress={() => { setEstoqueProdSel(p); setEstoqueQtd('1'); }}>
                          <Text style={s.listaItemNome}>{p.nome}</Text>
                          <Text style={s.listaItemPreco}>{p.estoque} {p.unidade || 'un'}</Text>
                        </TouchableOpacity>
                      ))
                  ) : (
                    <View style={{ marginTop: 8 }}>
                      <Text style={s.secValue}>{estoqueProdSel.nome}</Text>
                      <Text style={[s.fieldLabel, { marginTop: 8 }]}>Quantidade</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          style={[s.fieldInput, { flex: 1 }]}
                          value={estoqueQtd}
                          onChangeText={setEstoqueQtd}
                          keyboardType="decimal-pad"
                          placeholder="1"
                          placeholderTextColor="#999"
                        />
                        <TouchableOpacity style={[s.saveBtn, { flex: 0, paddingHorizontal: 20 }, estoqueModo === 'custo' ? { backgroundColor: '#7c3aed' } : {}]} onPress={adicionarItemEstoque}>
                          <Text style={s.saveBtnText}>+ Add</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.cancelBtn, { flex: 0, paddingHorizontal: 12, marginRight: 0 }]} onPress={() => setEstoqueProdSel(null)}>
                          <Text style={s.cancelBtnText}>↩</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: 1, borderColor: '#f1f5f9' }}>
                  <TouchableOpacity style={[s.cancelBtn, { flex: 1, marginRight: 0 }]} onPress={() => fecharModalEstoque(false)}>
                    <Text style={s.cancelBtnText}>Não houve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.saveBtn, { flex: 1, opacity: estoqueItens.length ? 1 : 0.4 }, estoqueModo === 'custo' ? { backgroundColor: '#7c3aed' } : {}]}
                    onPress={confirmarConsumoEstoque}
                    disabled={!estoqueItens.length}
                  >
                    <Text style={s.saveBtnText}>{estoqueModo === 'custo' ? 'Registrar custo' : estoqueModo === 'estoque' ? 'Registrar retirada' : 'Registrar'}</Text>
                  </TouchableOpacity>
                </View>
            </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Toast customizado ─────────────────────────────────────────── */}
        {toast && (
          <Animated.View style={{
            position: 'absolute', top: insets.top + 16, left: 16, right: 16, zIndex: 9999,
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          }}>
            <View style={{
              backgroundColor: '#fff', borderRadius: 16, padding: 16,
              flexDirection: 'row', alignItems: 'center', gap: 14,
              borderLeftWidth: 5, borderLeftColor: toast.color,
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
            }}>
              <Text style={{ fontSize: 28 }}>{toast.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b' }}>{toast.title}</Text>
                {toast.subtitle ? <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{toast.subtitle}</Text> : null}
              </View>
            </View>
          </Animated.View>
        )}

      </View>
    </KeyboardAvoidingView>
  );
}

function ItemForm({ nome, qtd, preco, onQtd, onPreco, onVoltar }) {
  return (
    <View>
      {onVoltar && (
        <TouchableOpacity onPress={onVoltar} style={{ marginBottom: 12 }}>
          <Text style={[s.editLink, { fontSize: 13 }]}>← Voltar</Text>
        </TouchableOpacity>
      )}
      {nome && <Text style={[s.secValue, { marginBottom: 12 }]}>{nome}</Text>}
      <Text style={s.fieldLabel}>Quantidade</Text>
      <TextInput
        style={s.fieldInput}
        value={qtd}
        onChangeText={onQtd}
        keyboardType="decimal-pad"
        placeholder="1"
        placeholderTextColor="#999"
      />
      <Text style={s.fieldLabel}>Preço unitário (R$)</Text>
      <TextInput
        style={s.fieldInput}
        value={preco}
        onChangeText={onPreco}
        keyboardType="decimal-pad"
        placeholder="0,00"
        placeholderTextColor="#999"
      />
      {(() => {
        const q = parseFloat(String(qtd).replace(',', '.')) || 0;
        const p = parseFloat(String(preco).replace(',', '.')) || 0;
        if (q > 0 && p > 0) return (
          <Text style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Subtotal: {fmtVal(q * p)}
          </Text>
        );
        return null;
      })()}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowSpaced: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  numero: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  descricao: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 4 },
  editLink: { fontSize: 12, color: '#2563eb', marginTop: 2 },
  secLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  secValue: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  secSub: { fontSize: 13, color: '#64748b', marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', paddingVertical: 6 },
  gridLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' },
  gridValue: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginTop: 2 },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  addBtn: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  itemNome: { fontSize: 14, color: '#334155', fontWeight: '500' },
  itemSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  itemVal: { fontSize: 14, color: '#2563eb', fontWeight: '600', marginRight: 8 },
  removeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '700' },
  valRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  valLabel: { fontSize: 14, color: '#64748b' },
  valText: { fontSize: 14, color: '#1e293b', fontWeight: '500' },
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
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1e293b' },
  modalClose: { fontSize: 20, color: '#94a3b8', paddingHorizontal: 4 },
  modalFooter: { padding: 16, borderTopWidth: 1, borderColor: '#f1f5f9' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f1f5f9' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabAtivo: { borderBottomWidth: 2, borderColor: '#2563eb' },
  tabText: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
  tabTextoAtivo: { color: '#2563eb', fontWeight: '700' },
  searchInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10,
    fontSize: 14, color: '#333', marginBottom: 12
  },
  listaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f8fafc' },
  listaItemNome: { fontSize: 14, color: '#1e293b', fontWeight: '500', flex: 1 },
  listaItemPreco: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 6, marginTop: 8, textTransform: 'uppercase' },
  fieldInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, fontSize: 15, color: '#333', marginBottom: 12 },
  totalBox: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  totalLabel: { fontSize: 13, color: '#16a34a', fontWeight: '600', marginBottom: 4 },
  totalVal: { fontSize: 26, color: '#15803d', fontWeight: 'bold' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#e2e8f0', justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: '#10b981' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', elevation: 2 },
  toggleThumbOn: { alignSelf: 'flex-end' },
  toggleLabel: { fontSize: 15, color: '#1e293b', fontWeight: '500' },
  pagRow: { marginBottom: 12 },
  metodoBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  metodoBtnAtivo: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  metodoBtnText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  metodoBtnTextoAtivo: { color: '#fff' },
  addPagBtn: { borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  addPagBtnText: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  somaPag: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderColor: '#e2e8f0' },
  somaLabel: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  somaVal: { fontSize: 14, color: '#1e293b', fontWeight: '700' },
});
