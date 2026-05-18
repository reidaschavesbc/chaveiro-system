const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const axios = require('axios');
const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const db = require('../database/db');

const IBGE_BC = '4202008';
const URL_PROD = 'https://sefin.nfse.gov.br/SefinNacional/nfse';
const URL_HOMOLOG = 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse';
const URL_DANFSE_PROD = 'https://adn.nfse.gov.br/danfse';
const URL_DANFSE_HOMOLOG = 'https://adn.producaorestrita.nfse.gov.br/danfse';

function getConfig(lojaId) {
  const rows = db.prepare(`SELECT chave, valor FROM nfse_config WHERE loja_id = ?`).all(lojaId);
  const cfg = {};
  for (const r of rows) cfg[r.chave] = r.valor;
  return cfg;
}

function extractCpfFromCert(cert) {
  // ICP-Brasil OID 2.16.76.1.3.4 = data nasc (8) + CPF (11) + NIS (11) + RG...
  const sanExt = cert.extensions.find(e => e.name === 'subjectAltName');
  if (!sanExt) return null;
  const raw = Buffer.from(sanExt.value, 'binary').toString('latin1');
  // OID 2.16.76.1.3.4 encoded as hex: 604c010304
  const hex = Buffer.from(sanExt.value, 'binary').toString('hex');
  const idx = hex.indexOf('604c010304');
  if (idx === -1) return null;
  // Após o OID: a0 LL 04 LL [data8][cpf11]...
  const afterOid = hex.substring(idx + 10);
  // Pular a0 LL 04 LL (4 bytes = 8 hex chars)
  const dataStr = Buffer.from(afterOid.substring(8), 'hex').toString('latin1');
  // Primeiros 8 chars = data nascimento, próximos 11 = CPF
  const cpf = dataStr.substring(8, 19).replace(/\D/g, '');
  return cpf.length === 11 ? cpf : null;
}

function loadCertificate(lojaId) {
  const cfg = getConfig(lojaId);
  const pfxPath = cfg.pfx_path || path.join(__dirname, '..', '41.370.832 ELAINE ESTER CORREA DA CUNHA_41370832000187.pfx');
  const pfxSenha = cfg.pfx_senha || '123456';

  const pfxBuffer = fs.readFileSync(pfxPath);
  const pfxDer = pfxBuffer.toString('binary');
  const pfxAsn1 = forge.asn1.fromDer(pfxDer);
  const pfxObj = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, pfxSenha);

  const keyBags = pfxObj.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
  const certBags = pfxObj.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];

  const privateKey = forge.pki.privateKeyToPem(keyBags[0].key);
  const certificate = forge.pki.certificateToPem(certBags[0].cert);
  const cpf = extractCpfFromCert(certBags[0].cert);

  return { privateKey, certificate, pfxBuffer, pfxSenha, cpf };
}

function padLeft(str, len, char = '0') {
  return String(str).padStart(len, char);
}

function buildDpsId(inscricao, tipoInscricao, serie, numeroDps) {
  const inscPadded = padLeft(inscricao.replace(/\D/g, ''), 14);
  return `DPS${IBGE_BC}${tipoInscricao}${inscPadded}${padLeft(serie, 5)}${padLeft(numeroDps, 15)}`;
}

function formatDecimal(val) {
  return Number(val).toFixed(2);
}

function buildDpsXml({ cnpj, cpf, inscricaoMunicipal, serie, numeroDps, dhEmi, dCompet,
  tomadorTipo, tomadorDoc, tomadorNome, tomadorEmail, tomadorFone,
  tomadorEndereco, tomadorNumero, tomadorComplemento, tomadorBairro, tomadorCidade, tomadorCep, tomadorCMun, tomadorUF,
  descricaoServico, valor, aliquotaIss, codTribNac, codTribMun, cnae,
  tpAmb, regimeTributario }) {

  const cnpjLimpo = cnpj.replace(/\D/g, '');
  // tpInsc: 1=CPF, 2=CNPJ (prestador sempre usa CNPJ neste sistema)
  const tipoInscricao = '2';
  const inscricao = cnpjLimpo;
  const dpsId = buildDpsId(inscricao, tipoInscricao, serie, numeroDps);
  const valorFmt = formatDecimal(valor);
  const issValor = formatDecimal(valor * (parseFloat(aliquotaIss) / 100));

  // Tomador: CPF ou CNPJ — sem documento omite o bloco inteiro
  let tomadorTag = '';
  if (tomadorTipo === 'CPF' && tomadorDoc) {
    tomadorTag = `<CPF>${tomadorDoc.replace(/\D/g, '').padStart(11, '0')}</CPF>`;
  } else if (tomadorTipo === 'CNPJ' && tomadorDoc) {
    tomadorTag = `<CNPJ>${tomadorDoc.replace(/\D/g, '').padStart(14, '0')}</CNPJ>`;
  }

  const tomadorNomeTag = tomadorNome ? `<xNome>${tomadorNome.substring(0, 150)}</xNome>` : '';
  const tomadorEmailTag = tomadorEmail ? `<email>${tomadorEmail}</email>` : '';

  // Regime tributário — opSimpNac: 1=não optante, 2=MEI, 3=ME/EPP
  // regEspTrib: 0=nenhum (obrigatório)
  let regTribXml = '';
  if (regimeTributario === 'mei') {
    regTribXml = `<regTrib><opSimpNac>2</opSimpNac><regEspTrib>0</regEspTrib></regTrib>`;
  } else if (regimeTributario === 'simples') {
    regTribXml = `<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib>`;
  } else {
    regTribXml = `<regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib>`;
  }

  const codTribNacFmt = String(codTribNac).replace(/\D/g, '').substring(0, 6).padEnd(6, '0');

  // Schema DPS: <end><endNac><cMun><CEP></endNac> primeiro, depois xLgr/nro/xBairro
  let endTomaXml = '';
  const cepLimpoToma = tomadorCep ? tomadorCep.replace(/\D/g, '').padStart(8, '0') : null;
  if (tomadorEndereco && tomadorNumero && tomadorBairro && tomadorCMun && cepLimpoToma) {
    endTomaXml = `
      <end>
        <endNac>
          <cMun>${tomadorCMun}</cMun>
          <CEP>${cepLimpoToma}</CEP>
        </endNac>
        <xLgr>${tomadorEndereco.substring(0, 125)}</xLgr>
        <nro>${String(tomadorNumero).substring(0, 10)}</nro>
        ${tomadorComplemento ? `<xCpl>${tomadorComplemento.substring(0, 60)}</xCpl>` : ''}
        <xBairro>${tomadorBairro.substring(0, 72)}</xBairro>
      </end>`;
  }

  const foneLimpo = tomadorFone ? tomadorFone.replace(/\D/g, '').substring(0, 20) : null;

  // Tomador: xNome é obrigatório em TCInfoPessoa
  const tomaXml = (tomadorTag && tomadorNome) ? `
    <toma>
      ${tomadorTag}
      <xNome>${tomadorNome.substring(0, 150)}</xNome>
      ${endTomaXml}
      ${foneLimpo   ? `<fone>${foneLimpo}</fone>`     : ''}
      ${tomadorEmail ? `<email>${tomadorEmail}</email>` : ''}
    </toma>` : '';

  const nDpsFmt = padLeft(numeroDps, 15);
  const serieFmt = padLeft(serie, 5);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS Id="${dpsId}">
    <tpAmb>${tpAmb}</tpAmb>
    <dhEmi>${dhEmi}</dhEmi>
    <verAplic>ChaveiroSystem_1.0</verAplic>
    <serie>${parseInt(serie)}</serie>
    <nDPS>${numeroDps}</nDPS>
    <dCompet>${dCompet}</dCompet>
    <tpEmit>1</tpEmit>
    <cLocEmi>${IBGE_BC}</cLocEmi>
    <prest>
      <CNPJ>${cnpjLimpo}</CNPJ>
      <IM>${inscricaoMunicipal}</IM>
      ${regTribXml}
    </prest>
    ${tomaXml}
    <serv>
      <locPrest>
        <cLocPrestacao>${IBGE_BC}</cLocPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>${codTribNacFmt}</cTribNac>
        ${codTribMun ? `<cTribMun>${codTribMun}</cTribMun>` : ''}
        <xDescServ>${descricaoServico.substring(0, 2000)}</xDescServ>
      </cServ>
    </serv>
    <valores>
      <vServPrest>
        <vServ>${valorFmt}</vServ>
      </vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <tpRetISSQN>1</tpRetISSQN>
          ${regimeTributario !== 'mei' ? `<pAliq>${formatDecimal(aliquotaIss)}</pAliq>` : ''}
        </tribMun>
        <totTrib>
          <indTotTrib>0</indTotTrib>
        </totTrib>
      </trib>
    </valores>
  </infDPS>
</DPS>`;

  return { xml, dpsId };
}

function signXml(xmlStr, privateKey, certificate, dpsId) {
  const sig = new SignedXml({ privateKey, publicCert: certificate });

  sig.addReference({
    uri: '#' + dpsId,
    xpath: `//*[@Id="${dpsId}"]`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });

  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

  sig.computeSignature(xmlStr, {
    location: { reference: '//*[local-name()="infDPS"]', action: 'after' },
  });

  return sig.getSignedXml();
}

async function emitirNfse(osId) {
  // Buscar loja_id da OS antes de qualquer coisa
  const osBase = db.prepare(`SELECT loja_id FROM ordens_servico WHERE id = ?`).get(osId);
  if (!osBase) throw new Error('OS não encontrada');
  if (!osBase.loja_id) throw new Error('OS sem loja associada — não é possível emitir NFS-e');
  const lojaId = osBase.loja_id;

  const cfg = getConfig(lojaId);
  const cnpj = cfg.cnpj || '41370832000187';
  const inscricaoMunicipal = cfg.inscricao_municipal || '184784';
  const aliquotaIss = cfg.aliquota_iss || '2.00';
  const codTribNac = cfg.cod_trib_nac || '14.01';
  const codTribMun = cfg.cod_trib_mun || '';
  const cnae = cfg.cnae || '';
  const regimeTributario = cfg.regime_tributario || 'simples';
  const tpAmb = cfg.ambiente || '2'; // 2=homologação por padrão

  // Buscar OS com dados do cliente
  const os = db.prepare(`
    SELECT os.*,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           c.cpf as cliente_cpf, c.cnpj as cliente_cnpj,
           c.email as cliente_email, c.telefone as cliente_telefone,
           c.endereco as cliente_endereco, c.numero as cliente_numero,
           c.complemento as cliente_complemento, c.bairro as cliente_bairro,
           c.cidade as cliente_cidade, c.cep as cliente_cep
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.id = ?
  `).get(osId);

  // Buscar itens da OS para compor descrição detalhada
  const itensOs = db.prepare(`
    SELECT ios.*, p.nome as produto_nome, ts.nome as servico_nome
    FROM itens_ordem_servico ios
    LEFT JOIN produtos p ON ios.produto_id = p.id
    LEFT JOIN tipos_servico ts ON ios.servico_id = ts.id
    WHERE ios.ordem_id = ?
  `).all(osId);

  if (!os) throw new Error('OS não encontrada');
  if (os.nfse_numero) throw new Error(`NFS-e já emitida para esta OS: ${os.nfse_numero}`);

  // Número sequencial da DPS por loja — usa o maior entre o MAX do banco e o config ultimo_seq
  const ultimaDps  = db.prepare(`SELECT MAX(nfse_numero_seq) as ultimo FROM ordens_servico WHERE nfse_numero_seq IS NOT NULL AND loja_id = ?`).get(lojaId);
  const cfgUltimo  = db.prepare(`SELECT valor FROM nfse_config WHERE loja_id = ? AND chave = 'ultimo_seq'`).get(lojaId);
  const ultimoSeq  = Math.max(ultimaDps?.ultimo || 0, parseInt(cfgUltimo?.valor || '0'));
  const numeroDps  = ultimoSeq + 1;
  const serie = '00001';

  // Reservar o número ANTES de enviar ao SEFIN — evita reutilização em caso de falha
  db.prepare(`UPDATE ordens_servico SET nfse_numero_seq = ?, nfse_status = 'pendente' WHERE id = ?`).run(numeroDps, osId);
  db.prepare(`INSERT OR REPLACE INTO nfse_config (loja_id, chave, valor) VALUES (?, 'ultimo_seq', ?)`).run(lojaId, String(numeroDps));

  const agora = new Date();
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dhEmi = brt.toISOString().substring(0, 19) + '-03:00';
  const dCompet = brt.toISOString().substring(0, 10);

  // Determinar tipo e documento do tomador
  let tomadorTipo = 'NENHUM';
  let tomadorDoc = null;
  if (os.cliente_cpf) { tomadorTipo = 'CPF'; tomadorDoc = os.cliente_cpf; }
  else if (os.cliente_cnpj) { tomadorTipo = 'CNPJ'; tomadorDoc = os.cliente_cnpj; }

  // Buscar código IBGE e UF pelo CEP via ViaCEP
  let tomadorCMun = null;
  let tomadorUF = null;
  const cepCliente = os.cliente_cep ? os.cliente_cep.replace(/\D/g, '') : null;
  if (cepCliente && cepCliente.length === 8) {
    try {
      const viacep = await axios.get(`https://viacep.com.br/ws/${cepCliente}/json/`, { timeout: 5000 });
      if (viacep.data && viacep.data.ibge) {
        tomadorCMun = viacep.data.ibge;
        tomadorUF   = viacep.data.uf;
      }
    } catch (_) { /* segue sem cMun via CEP */ }
  }

  // Fallback: sem CEP mas tem cidade — busca IBGE pelo nome do município
  if (!tomadorCMun) {
    const cidadeCliente = os.cliente_avulso_cidade || os.cliente_cidade;
    if (cidadeCliente) {
      try {
        const ibgeRes = await axios.get(
          `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(cidadeCliente)}`,
          { timeout: 5000 }
        );
        if (ibgeRes.data && ibgeRes.data.length >= 1) {
          const match = ibgeRes.data.find(m => m.nome.toLowerCase() === cidadeCliente.toLowerCase()) || ibgeRes.data[0];
          tomadorCMun = String(match.id);
          tomadorUF   = match.microrregiao?.mesorregiao?.UF?.sigla || null;
        }
      } catch (_) { /* segue sem cMun */ }
    }
  }

  const cert = loadCertificate(lojaId);

  const { xml: dpsXml, dpsId } = buildDpsXml({
    cnpj, cpf: cert.cpf, inscricaoMunicipal, serie, numeroDps,
    dhEmi, dCompet,
    tomadorTipo, tomadorDoc,
    tomadorNome: os.cliente_nome,
    tomadorEmail: os.cliente_email,
    tomadorFone:  os.cliente_telefone,
    tomadorEndereco:    os.cliente_avulso_rua    || os.cliente_endereco,
    tomadorNumero:      os.cliente_avulso_numero || os.cliente_numero,
    tomadorComplemento: os.cliente_complemento,
    tomadorBairro:      os.cliente_bairro,
    tomadorCidade:      os.cliente_avulso_cidade || os.cliente_cidade,
    tomadorCep:         os.cliente_cep,
    tomadorCMun, tomadorUF,
    descricaoServico: buildDescricaoDetalhada(os, itensOs),
    valor: os.valor,
    aliquotaIss, codTribNac, codTribMun, cnae,
    tpAmb, regimeTributario,
  });

  console.log('[NFS-e] dpsId:', dpsId);
  console.log('[NFS-e] cLocEmi:', IBGE_BC, '| serie:', serie, '| nDPS:', numeroDps, '| CNPJ:', cnpj.replace(/\D/g,''));
  const xmlAssinado = signXml(dpsXml, cert.privateKey, cert.certificate, dpsId);
  console.log('[NFS-e] XML assinado (primeiros 800 chars):\n', xmlAssinado.substring(0, 800));

  // GZip + Base64 do XML assinado
  const xmlBuffer = Buffer.from(xmlAssinado, 'utf-8');
  const xmlGzip = zlib.gzipSync(xmlBuffer);
  const dpsXmlGZipB64 = xmlGzip.toString('base64');

  // Enviar para governo via mTLS com JSON
  const url = tpAmb === '1' ? URL_PROD : URL_HOMOLOG;
  const agent = new https.Agent({
    pfx: cert.pfxBuffer,
    passphrase: cert.pfxSenha,
    rejectUnauthorized: true,
  });

  let resposta;
  try {
    const res = await axios.post(url, { dpsXmlGZipB64 }, {
      httpsAgent: agent,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    resposta = res.data;
    console.log('[NFS-e] RESPOSTA SEFIN:', JSON.stringify(resposta).substring(0, 1000));
  } catch (err) {
    const msg = err.response?.data || err.message;
    throw new Error(`Erro na comunicação com SEFIN: ${typeof msg === 'string' ? msg.substring(0, 500) : JSON.stringify(msg).substring(0, 500)}`);
  }

  // Processar resposta — SEFIN retorna JSON
  // O número da nota (nNFSe) fica dentro do nfseXmlGZipB64, não no nível raiz do JSON
  let nfseXmlDecoded = null;
  if (resposta?.nfseXmlGZipB64) {
    try {
      nfseXmlDecoded = zlib.gunzipSync(Buffer.from(resposta.nfseXmlGZipB64, 'base64')).toString('utf-8');
    } catch (_) {}
  }
  const chaveAcesso = resposta?.chNFSe || resposta?.chaveAcesso || extrairChaveAcesso(JSON.stringify(resposta));
  const numeroNota  = resposta?.nNFSe  || resposta?.numero
    || (nfseXmlDecoded ? extrairNumeroNota(nfseXmlDecoded) : null)
    || extrairNumeroNota(JSON.stringify(resposta));

  // Salvar no banco
  db.prepare(`
    UPDATE ordens_servico SET
      nfse_chave_acesso = ?,
      nfse_numero = ?,
      nfse_numero_seq = ?,
      nfse_status = 'autorizada',
      nfse_xml_dps = ?,
      nfse_emitida_em = datetime('now','localtime'),
      nfse_ambiente = ?
    WHERE id = ?
  `).run(chaveAcesso, numeroNota, numeroDps, xmlAssinado, tpAmb, osId);

  return { chaveAcesso, numeroNota, xml: resposta };
}

function extrairChaveAcesso(xmlResp) {
  if (typeof xmlResp !== 'string') return null;
  const match = xmlResp.match(/<chNFSe>([^<]+)<\/chNFSe>/) || xmlResp.match(/<chaveAcesso>([^<]+)<\/chaveAcesso>/);
  return match ? match[1] : null;
}

function extrairNumeroNota(xmlResp) {
  if (typeof xmlResp !== 'string') return null;
  const match = xmlResp.match(/<nNFSe>([^<]+)<\/nNFSe>/) || xmlResp.match(/<numero>([^<]+)<\/numero>/);
  return match ? match[1] : null;
}

async function consultarDanfse(chaveAcesso, lojaId) {
  const cfg = getConfig(lojaId);
  const tpAmb = cfg.ambiente || '2';
  const cert = loadCertificate(lojaId);
  const agent = new https.Agent({
    pfx: cert.pfxBuffer,
    passphrase: cert.pfxSenha,
    rejectUnauthorized: true,
  });

  const baseUrl = tpAmb === '1' ? URL_DANFSE_PROD : URL_DANFSE_HOMOLOG;
  const url = `${baseUrl}/nfse/${chaveAcesso}`;
  const ambiente = tpAmb === '1' ? 'produção' : 'homologação';

  try {
    const res = await axios.get(url, {
      httpsAgent: agent,
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 502 || status === 503) {
      throw new Error(`Servidor do governo indisponível (${status}) no ambiente de ${ambiente}. Tente novamente em alguns minutos.`);
    }
    if (status === 404) {
      throw new Error(`Nota não encontrada no servidor do governo (ambiente: ${ambiente}). Verifique se a emissão foi concluída.`);
    }
    if (status === 401 || status === 403) {
      throw new Error(`Sem autorização para acessar esta nota (${status}). Verifique o certificado digital.`);
    }
    const detalhe = err.response?.data
      ? Buffer.from(err.response.data).toString('utf-8').substring(0, 300)
      : err.message;
    throw new Error(`Erro ao buscar DANFSE (${status || 'sem resposta'}): ${detalhe}`);
  }
}


function buildDescricaoDetalhada(os, itens) {
  const partes = [];

  if (os.descricao) partes.push(os.descricao);

  if (itens && itens.length > 0) {
    if (partes.length) partes.push('');
    partes.push('Itens:');
    for (const item of itens) {
      const nome = item.produto_nome || item.servico_nome || item.descricao || 'Item';
      const linha = `- ${nome}: ${item.quantidade}x R$ ${formatDecimal(item.preco_unitario)} = R$ ${formatDecimal(item.subtotal)}`;
      partes.push(linha);
    }
  }

  return partes.join('\n').substring(0, 2000);
}

function previewNfse(osId) {
  const osBase = db.prepare(`SELECT loja_id FROM ordens_servico WHERE id = ?`).get(osId);
  if (!osBase) throw new Error('OS não encontrada');
  const lojaId = osBase.loja_id;

  const cfg = getConfig(lojaId || 0);
  const cnpj = cfg.cnpj || '41370832000187';
  const inscricaoMunicipal = cfg.inscricao_municipal || '184784';
  const aliquotaIss = cfg.aliquota_iss || '2.00';
  const codTribNac = cfg.cod_trib_nac || '14.01';
  const regimeTributario = cfg.regime_tributario || 'simples';
  const tpAmb = cfg.ambiente || '2';

  const os = db.prepare(`
    SELECT os.*,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           c.cpf as cliente_cpf, c.cnpj as cliente_cnpj,
           c.email as cliente_email, c.telefone as cliente_telefone,
           c.endereco as cliente_endereco, c.numero as cliente_numero,
           c.complemento as cliente_complemento, c.bairro as cliente_bairro,
           c.cidade as cliente_cidade, c.cep as cliente_cep
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.id = ?
  `).get(osId);

  if (!os) throw new Error('OS não encontrada');
  if (os.nfse_status === 'autorizada') throw new Error('NFS-e já emitida para esta OS');

  const itens = db.prepare(`
    SELECT ios.*, p.nome as produto_nome, ts.nome as servico_nome
    FROM itens_ordem_servico ios
    LEFT JOIN produtos p ON ios.produto_id = p.id
    LEFT JOIN tipos_servico ts ON ios.servico_id = ts.id
    WHERE ios.ordem_id = ?
  `).all(osId);

  const descricao = buildDescricaoDetalhada(os, itens);

  let tomadorTipo = 'Não informado';
  let tomadorDoc = null;
  if (os.cliente_cpf) { tomadorTipo = 'CPF'; tomadorDoc = os.cliente_cpf; }
  else if (os.cliente_cnpj) { tomadorTipo = 'CNPJ'; tomadorDoc = os.cliente_cnpj; }

  const regimes = { mei: 'MEI', simples: 'Simples Nacional', normal: 'Regime Normal' };

  return {
    os: { numero: os.numero, valor: os.valor },
    prestador: { cnpj, inscricaoMunicipal, regime: regimes[regimeTributario] || regimeTributario, aliquotaIss, codTribNac },
    tomador: {
      nome: os.cliente_nome, tipo: tomadorTipo, doc: tomadorDoc,
      email: os.cliente_email, fone: os.cliente_telefone,
      endereco: [os.cliente_endereco, os.cliente_numero, os.cliente_complemento].filter(Boolean).join(', '),
      bairro: os.cliente_bairro, cidade: os.cliente_cidade, cep: os.cliente_cep,
    },
    servico: { descricao },
    itens,
    ambiente: tpAmb === '1' ? 'Produção' : 'Homologação',
  };
}

module.exports = { emitirNfse, consultarDanfse, loadCertificate, previewNfse };
