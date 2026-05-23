function fmtVal(v) {
    return 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',');
}

function fmtDate(s) {
    if (!s) return '';
    const d = String(s).slice(0, 10);
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${y}`;
}

function fmtDH(dp) {
    if (!dp) return '';
    const s = String(dp).replace('T', ' ').slice(0, 16);
    const [dt, hr] = s.split(' ');
    const [y, m, d] = dt.split('-');
    return `${d}/${m}/${y}${hr ? ' ' + hr : ''}`;
}

function fmtAddr(rua, num, comp, bairro, cidade, ref) {
    if (!rua && !cidade) return '';
    let linha = rua || '';
    if (num) linha += `, ${num}`;
    if (comp) linha += ` - ${comp}`;
    if (bairro) linha += (linha ? ', ' : '') + bairro;
    if (cidade) linha += (linha ? ' - ' : '') + cidade;
    return `\n📍 *Endereço:* ${linha}${ref ? '\n🗺️ *Ref:* ' + ref : ''}`;
}

module.exports = { fmtVal, fmtDate, fmtDH, fmtAddr };
