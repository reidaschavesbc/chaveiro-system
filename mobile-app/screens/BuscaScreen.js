import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView, Image, Modal
} from 'react-native';
import api from '../services/api';
import UpperTextInput from '../components/UpperTextInput';

const SERVER = api.defaults.baseURL.replace('/api/app', '');

function fmtV(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function BuscaScreen() {
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState('todos');
  const [produtos, setProdutos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imgModal, setImgModal] = useState(null); // { src, nome }

  useEffect(() => {
    Promise.all([api.get('/produtos'), api.get('/servicos')])
      .then(([rP, rS]) => { setProdutos(rP.data); setServicos(rS.data); })
      .finally(() => setLoading(false));
  }, []);

  const q = busca.toLowerCase().trim();
  const prodsFiltrados = produtos.filter(p => !q || p.nome.toLowerCase().includes(q));
  const servsFiltrados = servicos.filter(s => !q || s.nome.toLowerCase().includes(q));

  const mostrarProd = aba === 'todos' || aba === 'prod';
  const mostrarServ = aba === 'todos' || aba === 'serv';

  if (loading) return <ActivityIndicator style={{ flex: 1, marginTop: 60 }} size="large" color="#2563eb" />;

  return (
    <View style={s.container}>
      {/* Modal imagem ampliada */}
      <Modal visible={!!imgModal} transparent animationType="fade" onRequestClose={() => setImgModal(null)}>
        <TouchableOpacity style={s.imgOverlay} activeOpacity={1} onPress={() => setImgModal(null)}>
          <Text style={s.imgNome}>{imgModal?.nome}</Text>
          {imgModal && <Image source={{ uri: imgModal.src }} style={s.imgFull} resizeMode="contain" />}
          <Text style={s.imgFechar}>Toque para fechar</Text>
        </TouchableOpacity>
      </Modal>
      {/* Busca */}
      <View style={s.searchWrap}>
        <UpperTextInput
          style={s.search}
          placeholder="Buscar produto ou serviço..."
          value={busca}
          onChangeText={setBusca}
          autoFocus
          clearButtonMode="while-editing"
        />
      </View>

      {/* Abas */}
      <View style={s.abas}>
        {[['todos','Todos'], ['prod','Produtos'], ['serv','Serviços']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[s.aba, aba === key && s.abaAtiva]}
            onPress={() => setAba(key)}
          >
            <Text style={[s.abaText, aba === key && s.abaTextAtiva]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {mostrarProd && prodsFiltrados.length > 0 && (
          <>
            <Text style={s.secTitulo}>📦 Produtos ({prodsFiltrados.length})</Text>
            {prodsFiltrados.map(p => {
              const semEstoque = p.estoque <= 0;
              const estoqueColor = semEstoque ? '#ef4444' : p.estoque <= (p.estoque_minimo || 2) ? '#f59e0b' : '#10b981';
              const imgSrc = p.imagem ? `${SERVER}${p.imagem}` : null;
              return (
                <View key={p.id} style={s.card}>
                  {imgSrc && (
                    <TouchableOpacity onPress={() => setImgModal({ src: imgSrc, nome: p.nome })} style={s.verImgBtn}>
                      <Text style={s.verImgText}>📷</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={s.nome}>{p.nome}</Text>
                  <Text style={s.preco}>{fmtV(p.preco_venda)}</Text>
                  <Text style={[s.estoqueText, { color: estoqueColor }]}>
                    {semEstoque ? 'Sem estoque' : `${p.estoque} ${p.unidade || 'un'} em estoque`}
                  </Text>
                  {p.descricao ? <Text style={s.desc}>{p.descricao}</Text> : null}
                </View>
              );
            })}
          </>
        )}

        {mostrarServ && servsFiltrados.length > 0 && (
          <>
            <Text style={[s.secTitulo, { marginTop: mostrarProd && prodsFiltrados.length ? 16 : 0 }]}>🔧 Serviços ({servsFiltrados.length})</Text>
            {servsFiltrados.map(sv => (
              <View key={sv.id} style={[s.card, { borderLeftColor: '#7c3aed' }]}>
                <Text style={s.nome}>{sv.nome}</Text>
                <Text style={[s.preco, { color: '#7c3aed' }]}>{fmtV(sv.preco_base)}</Text>
                {sv.descricao ? <Text style={s.desc}>{sv.descricao}</Text> : null}
              </View>
            ))}
          </>
        )}

        {!prodsFiltrados.length && !servsFiltrados.length && (
          <Text style={s.vazio}>
            {q ? `Nenhum resultado para "${busca}"` : 'Nenhum item cadastrado'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  searchWrap: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  search: {
    backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: '#1e293b',
  },
  abas: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  aba: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  abaAtiva: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  abaText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  abaTextAtiva: { color: '#fff' },
  secTitulo: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#2563eb',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
  },
  nome: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  preco: { fontSize: 22, fontWeight: '800', color: '#2563eb', marginBottom: 4 },
  estoqueText: { fontSize: 12, fontWeight: '600' },
  desc: { fontSize: 12, color: '#64748b', marginTop: 4 },
  vazio: { textAlign: 'center', marginTop: 60, color: '#94a3b8', fontSize: 15 },
  verImgBtn: { alignSelf: 'flex-start', marginBottom: 6 },
  verImgText: { fontSize: 26 },
  imgOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  imgNome: { color: '#e2e8f0', fontSize: 15, fontWeight: '600', marginBottom: 14, textAlign: 'center' },
  imgFull: { width: '100%', height: '70%', borderRadius: 12 },
  imgFechar: { color: '#94a3b8', fontSize: 12, marginTop: 16 },
});

