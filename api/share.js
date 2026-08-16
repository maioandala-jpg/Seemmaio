// /api/share.js
// ══════════════════════════════════════════════════════════════════
// Endpoint de compartilhamento do TRAB (SEEM).
// Serve uma página com Open Graph dinâmico (título, imagem e resumo
// da notícia específica) para os "crawlers" do Facebook, WhatsApp,
// Instagram, Twitter/X etc. — que não executam JavaScript e só leem
// as tags <meta> do HTML retornado na primeira resposta.
//
// Para uma pessoa de verdade que clique no link, a página redireciona
// imediatamente (meta refresh + JS) para o site normal (SPA), já
// abrindo a notícia certa via ?noticia=TS.
//
// URL de uso:  https://seemmaio.vercel.app/api/share?ts=1234567890
// ══════════════════════════════════════════════════════════════════

const FB = 'https://seem-new2-default-rtdb.firebaseio.com';
const SITE_URL = 'https://seemmaio.vercel.app';

// Valores padrão — mesmos já usados no <head> do site (fallback caso
// a notícia não seja encontrada ou não venha nenhum ts).
const PADRAO = {
  titulo: 'SEEM — Só o que importa no mercado de trabalho lusófono',
  descricao: 'Cobertura em tempo real do mercado de trabalho lusófono: vagas, demissões, greves, legislação e muito mais.',
  imagem: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=630&fit=crop&q=80'
};

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resumir(texto, max) {
  if (!texto) return '';
  const limpo = String(texto).replace(/\s+/g, ' ').trim();
  return limpo.length > max ? limpo.slice(0, max - 1).trim() + '…' : limpo;
}

module.exports = async function handler(req, res) {
  const ts = req.query && req.query.ts ? String(req.query.ts).trim() : '';
  const destino = ts
    ? `${SITE_URL}/?noticia=${encodeURIComponent(ts)}`
    : `${SITE_URL}/`;

  let titulo = PADRAO.titulo;
  let descricao = PADRAO.descricao;
  let imagem = PADRAO.imagem;

  if (ts && /^\d+$/.test(ts)) {
    try {
      const url = `${FB}/noticias.json?orderBy=%22ts%22&equalTo=${ts}`;
      const r = await fetch(url);
      if (r.ok) {
        const dados = await r.json();
        const item = dados ? Object.values(dados)[0] : null;
        if (item) {
          titulo = item.titulo || titulo;
          descricao = item.subtitulo || resumir(item.corpo, 160) || descricao;
          if (item.imagem) imagem = item.imagem;
        }
      }
    } catch (e) {
      // Em caso de falha, cai nos valores padrão — nunca quebra a página.
    }
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(titulo)}</title>
<meta name="description" content="${escHtml(descricao)}">
<meta name="robots" content="noindex, follow">

<!-- Open Graph -->
<meta property="og:type" content="article">
<meta property="og:title" content="${escHtml(titulo)}">
<meta property="og:description" content="${escHtml(descricao)}">
<meta property="og:image" content="${escHtml(imagem)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${escHtml(destino)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="SEEM">

<!-- Twitter / X Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(titulo)}">
<meta name="twitter:description" content="${escHtml(descricao)}">
<meta name="twitter:image" content="${escHtml(imagem)}">

<!-- Redireciona pessoas reais para o site (os crawlers de rede social não seguem isso) -->
<meta http-equiv="refresh" content="0; url=${escHtml(destino)}">
<script>window.location.replace(${JSON.stringify(destino)});</script>
</head>
<body>
<p style="font-family:sans-serif">Redirecionando… <a href="${escHtml(destino)}">clique aqui</a> se a página não abrir automaticamente.</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.status(200).send(html);
};
