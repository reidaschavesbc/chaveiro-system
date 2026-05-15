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

function getConfig() {
  const rows = db.prepare(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'nfse_%'`).all();
  const cfg = {};
  for (const r of rows) cfg[r.chave.replace('nfse_', '')] = r.valor;
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

function loadCertificate() {
  const cfg = getConfig();
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
  tomadorTipo, tomadorDoc, tomadorNome, tomadorEmail,
  descricaoServico, valor, aliquotaIss, codTribNac, codTribMun, cnae,
  tpAmb, regimeTributario }) {

  const cnpjLimpo = cnpj.replace(/\D/g, '');
  // MEI usa CPF no prest (tipoInscricao=2); empresa usa CNPJ (tipoInscricao=1)
  const usarCpf = cpf && regimeTributario === 'mei';
  const tipoInscricao = usarCpf ? '2' : '1';
  const inscricao = usarCpf ? cpf : cnpjLimpo;
  const dpsId = buildDpsId(inscricao, tipoInscricao, serie, numeroDps);
  const valorFmt = formatDecimal(valor);
  const issValor = formatDecimal(valor * (parseFloat(aliquotaIss) / 100));

  // Tomador: CPF ou CNPJ ou sem documento
  let tomadorTag = '';
  if (tomadorTipo === 'CPF' && tomadorDoc) {
    tomadorTag = `<CPF>${tomadorDoc.replace(/\D/g, '').padStart(11, '0')}</CPF>`;
  } else if (tomadorTipo === 'CNPJ' && tomadorDoc) {
    tomadorTag = `<CNPJ>${tomadorDoc.replace(/\D/g, '').padStart(14, '0')}</CNPJ>`;
  } else {
    tomadorTag = `<cNaoNIF>9</cNaoNIF>`; // não informado
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

  // Tomador: xNome é obrigatório em TCInfoPessoa
  const tomaXml = (tomadorTag && tomadorNome) ? `
    <toma>
      ${tomadorTag}
      <xNome>${tomadorNome.substring(0, 150)}</xNome>
      ${tomadorEmail ? `<email>${tomadorEmail}</email>` : ''}
    </toma>` : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS Id="${dpsId}">
    <tpAmb>${tpAmb}</tpAmb>
    <dhEmi>${dhEmi}</dhEmi>
    <verAplic>ChaveiroSystem_1.0</verAplic>
    <serie>${String(serie)}</serie>
    <nDPS>${String(numeroDps)}</nDPS>
    <dCompet>${dCompet}</dCompet>
    <tpEmit>1</tpEmit>
    <cLocEmi>${IBGE_BC}</cLocEmi>
    <prest>
      ${usarCpf ? `<CPF>${cpf}</CPF>` : `<CNPJ>${cnpjLimpo}</CNPJ>`}
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
          <pAliq>${formatDecimal(aliquotaIss)}</pAliq>
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
  const cfg = getConfig();
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
           c.email as cliente_email
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.id = ?
  `).get(osId);

  if (!os) throw new Error('OS não encontrada');
  if (os.nfse_numero) throw new Error(`NFS-e já emitida para esta OS: ${os.nfse_numero}`);

  // Número sequencial da DPS
  const ultimaDps = db.prepare(`SELECT MAX(nfse_numero_seq) as ultimo FROM ordens_servico WHERE nfse_numero_seq IS NOT NULL`).get();
  const numeroDps = (ultimaDps?.ultimo || 0) + 1;
  const serie = '00001';

  const agora = new Date();
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dhEmi = brt.toISOString().substring(0, 19) + '-03:00';
  const dCompet = brt.toISOString().substring(0, 10);

  // Determinar tipo e documento do tomador
  let tomadorTipo = 'NENHUM';
  let tomadorDoc = null;
  if (os.cliente_cpf) { tomadorTipo = 'CPF'; tomadorDoc = os.cliente_cpf; }
  else if (os.cliente_cnpj) { tomadorTipo = 'CNPJ'; tomadorDoc = os.cliente_cnpj; }

  const cert = loadCertificate();

  const { xml: dpsXml, dpsId } = buildDpsXml({
    cnpj, cpf: cert.cpf, inscricaoMunicipal, serie, numeroDps,
    dhEmi, dCompet,
    tomadorTipo, tomadorDoc,
    tomadorNome: os.cliente_nome,
    tomadorEmail: os.cliente_email,
    descricaoServico: os.descricao,
    valor: os.valor,
    aliquotaIss, codTribNac, codTribMun, cnae,
    tpAmb, regimeTributario,
  });

  const xmlAssinado = signXml(dpsXml, cert.privateKey, cert.certificate, dpsId);

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
  } catch (err) {
    const msg = err.response?.data || err.message;
    throw new Error(`Erro na comunicação com SEFIN: ${typeof msg === 'string' ? msg.substring(0, 500) : JSON.stringify(msg).substring(0, 500)}`);
  }

  // Processar resposta
  const chaveAcesso = extrairChaveAcesso(resposta);
  const numeroNota = extrairNumeroNota(resposta);

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

async function consultarDanfse(chaveAcesso) {
  const cfg = getConfig();
  const tpAmb = cfg.ambiente || '2';
  const cert = loadCertificate();
  const agent = new https.Agent({
    pfx: cert.pfxBuffer,
    passphrase: cert.pfxSenha,
    rejectUnauthorized: true,
  });

  const baseUrl = tpAmb === '1' ? URL_DANFSE_PROD : URL_DANFSE_HOMOLOG;
  const url = `${baseUrl}/nfse/${chaveAcesso}`;

  const res = await axios.get(url, {
    httpsAgent: agent,
    responseType: 'arraybuffer',
    timeout: 30000,
  });

  return res.data; // PDF buffer
}

module.exports = { emitirNfse, consultarDanfse, loadCertificate };
