import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import api from '../services/api';

export default function OSNovaScreen({ navigation, route }) {
  const vendedorId   = route?.params?.vendedor_id   || null;
  const vendedorNome = route?.params?.vendedor_nome || null;

  const [isPlantao, setIsPlantao] = useState(false);
  const [chaveAuto, setChaveAuto] = useState(false);
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTel, setClienteTel] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [cidade, setCidade] = useState('');
  const [referencia, setReferencia] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    if (!isPlantao && !descricao.trim()) {
      Alert.alert('Atenção', 'Informe a descrição do serviço'); return;
    }
    if (isPlantao && !rua.trim()) {
      Alert.alert('Atenção', 'Informe o endereço do plantão'); return;
    }

    setSalvando(true);
    try {
      const { data } = await api.post('/os', {
        cliente_nome_avulso: clienteNome.trim() || null,
        cliente_telefone_avulso: clienteTel.trim() || null,
        cliente_avulso_rua: rua.trim() || null,
        cliente_avulso_numero: numero.trim() || null,
        cliente_avulso_complemento: complemento.trim() || null,
        cliente_avulso_cidade: cidade.trim() || null,
        cliente_avulso_referencia: referencia.trim() || null,
        descricao: descricao.trim() || null,
        is_plantao: isPlantao,
        chave_auto: chaveAuto,
        vendedor_id: vendedorId,
      });
      navigation.replace('OSDetalhe', { osId: data.id });
    } catch (e) {
      Alert.alert('Erro', e.response?.data?.error || 'Não foi possível criar a OS');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Banner funcionário (quando admin cria para alguém) */}
        {vendedorNome && (
          <View style={s.funcBanner}>
            <Text style={s.funcBannerText}>👤 Para: <Text style={{ fontWeight: '700' }}>{vendedorNome}</Text></Text>
          </View>
        )}

        {/* Toggles */}
        <View style={s.togglesCard}>
          <View style={s.toggleRow}>
            <View>
              <Text style={s.plantaoLabel}>🌙 Plantão</Text>
              <Text style={s.plantaoSub}>Não exige serviço, só endereço</Text>
            </View>
            <Switch
              value={isPlantao}
              onValueChange={v => { setIsPlantao(v); if (v) setChaveAuto(false); }}
              trackColor={{ false: '#e2e8f0', true: '#7c3aed' }}
              thumbColor="#fff"
            />
          </View>
          {!isPlantao && (
            <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, marginTop: 4 }]}>
              <View>
                <Text style={s.chaveLabel}>🔑 Chave Auto</Text>
                <Text style={s.plantaoSub}>OS de chave automotiva</Text>
              </View>
              <Switch
                value={chaveAuto}
                onValueChange={setChaveAuto}
                trackColor={{ false: '#e2e8f0', true: '#f59e0b' }}
                thumbColor="#fff"
              />
            </View>
          )}
        </View>

        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Cliente</Text>
          <TextInput
            style={s.input}
            placeholder="Nome do cliente (opcional)"
            value={clienteNome}
            onChangeText={setClienteNome}
          />
          <TextInput
            style={s.input}
            placeholder="Telefone (opcional)"
            value={clienteTel}
            onChangeText={setClienteTel}
            keyboardType="phone-pad"
          />
        </View>

        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Endereço{isPlantao ? ' *' : ' (opcional)'}</Text>
          <TextInput
            style={s.input}
            placeholder="Rua / Av."
            value={rua}
            onChangeText={setRua}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Nº"
              value={numero}
              onChangeText={setNumero}
              keyboardType="numeric"
            />
            <TextInput
              style={[s.input, { flex: 2 }]}
              placeholder="Complemento (ap, bloco...)"
              value={complemento}
              onChangeText={setComplemento}
            />
          </View>
          <TextInput
            style={s.input}
            placeholder="Cidade"
            value={cidade}
            onChangeText={setCidade}
          />
          <TextInput
            style={s.input}
            placeholder="Referência (perto de, cor da casa...)"
            value={referencia}
            onChangeText={setReferencia}
          />
        </View>

        {!isPlantao && (
          <View style={s.secao}>
            <Text style={s.secaoTitulo}>Descrição *</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Descreva o serviço..."
              value={descricao}
              onChangeText={setDescricao}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        )}

        {isPlantao && (
          <View style={s.secao}>
            <Text style={s.secaoTitulo}>Observação (opcional)</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Observações sobre o plantão..."
              value={descricao}
              onChangeText={setDescricao}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        )}

        <TouchableOpacity
          style={[s.btnCriar, isPlantao && s.btnCriarPlantao, salvando && { opacity: 0.6 }]}
          onPress={criar}
          disabled={salvando}
        >
          {salvando
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnCriarText}>{isPlantao ? '🌙 Criar Plantão' : 'Criar OS'}</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  togglesCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 1 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plantaoLabel: { fontSize: 15, fontWeight: '700', color: '#7c3aed' },
  chaveLabel: { fontSize: 15, fontWeight: '700', color: '#b45309' },
  plantaoSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  secao: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, elevation: 1 },
  secaoTitulo: { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc', marginBottom: 8,
  },
  textarea: { minHeight: 80 },
  btnCriar: {
    backgroundColor: '#2563eb', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  btnCriarPlantao: { backgroundColor: '#7c3aed' },
  btnCriarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  funcBanner: {
    backgroundColor: '#ede9fe', borderRadius: 10, padding: 12,
    marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#7c3aed',
  },
  funcBannerText: { fontSize: 14, color: '#5b21b6' },
});
