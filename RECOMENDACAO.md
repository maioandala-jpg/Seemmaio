# Sistema de Recomendação do SEEM

## 1. Arquitetura

```
Interação do utilizador (view, open, read_time, complete, like, save, share, not_interested)
        │
        ▼
registarEvento() ──► atualizarPerfil()  ──► recPerfil (localStorage, sempre)
                                          └─► /perfis/{uid} no Firebase (só autenticados, debounced, dados agregados apenas)
        │
        ▼
applyFilter() (após pesquisa + filtros de categoria/país/setor)
        │
        ▼
obterRecomendacoes(filteredNews)
   ├─ recomendarNoticias() → calcularPontuacao() por notícia + mistura 60/20/15/5
   └─ diversificarFeed()   → evita repetição de categoria/país seguidas
        │
        ▼
renderHero() + renderFeed() (com rótulo de transparência "🎯 Porque lês sobre…")
```

Tudo corre no browser (sem custo de servidor). O único ponto que toca o Firebase é a sincronização opcional do perfil agregado para utilizadores autenticados — não há leitura de eventos brutos por outros utilizadores.

## 2. Estrutura de dados no Firebase (Realtime Database)

```
seem-new2-default-rtdb
├── noticias/          (já existente)
├── comentarios/        (já existente)
└── perfis/
    └── {uid}/
        ├── categorias: { VAGAS: 12.5, GREVES: -3, ... }
        ├── paises:     { "Moçambique": 8, "Portugal": 2 }
        ├── setores:    { tecnologia: 5 }
        └── atualizadoEm: 1755900000000
```

Não guarda nome, e-mail, IP, texto lido nem histórico de cliques — só pontuações agregadas por categoria/país/setor, para poder restaurar a personalização noutro dispositivo.

## 3. Regras de segurança sugeridas (Firebase RTDB)

```json
{
  "rules": {
    "noticias": {
      ".read": true,
      ".write": "auth != null && root.child('admins').child(auth.uid).exists()"
    },
    "comentarios": {
      "$ts": {
        ".read": true,
        ".write": "auth != null",
        "$commentId": {
          ".validate": "newData.hasChildren(['texto','autor']) && newData.child('texto').isString() && newData.child('texto').val().length <= 1000"
        }
      }
    },
    "perfis": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        ".validate": "newData.hasChildren(['categorias','paises','setores'])"
      }
    },
    "manutencao": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" }
  }
}
```

Pontos-chave: leitura pública só onde é necessária (notícias, comentários); escrita de notícias restrita a administradores; cada utilizador só lê/escreve o seu próprio perfil; validação de tamanho nos comentários. Para bloquear spam de eventos com mais rigor (limite de frequência por IP/uid), o próximo passo é mover a escrita de eventos para uma Cloud Function/API em vez de escrita direta do browser.

## 4. O que já está implementado no `index.html`

- **Fase 1** (regras): pontuação por categoria/país/setor, atualidade, já-vista.
- **Fase 2** (comportamento): tempo ativo de leitura (só conta com a aba visível), leitura completa, gostos, guardados, partilhas, "não me interessa".
- Feed híbrido 60/20/15/5 com diversificação (máx. ~2 notícias seguidas da mesma categoria/país).
- Transparência: rótulo "🎯 Porque lês sobre…" em cada notícia recomendada por afinidade.
- Controlo do utilizador: botão 🎯 no cabeçalho com interruptor para desligar a personalização (volta ao feed cronológico) e botão para apagar o histórico de interesses.
- A pesquisa e os filtros de categoria/país/setor continuam a mandar primeiro; a recomendação só reordena o que já passou por eles.

## 5. Fases futuras (não implementadas ainda)

- **Fase 3** — similaridade de conteúdo (embeddings de título/corpo) e filtragem colaborativa ("quem leu X também leu Y").
- **Fase 4** — testes A/B: metade dos utilizadores vê feed cronológico, metade vê feed recomendado; compara retorno em 7 dias, leitura completa e denúncias.
- **Fase 5** — só aumentar o peso da personalização depois de confirmar, com dados reais, que ela não reduz diversidade nem confiança.

## 6. Plano de testes

1. **Utilizador novo (perfil vazio):** deve ver feed ≈ cronológico (afinidade = 0 em tudo, então o score é dominado por atualidade); confirmar que não trava nem mostra `NaN`.
2. **Poucos dados:** com < 6 notícias filtradas, `recomendarNoticias` devolve a lista tal como está (evita misturas artificiais em conjuntos pequenos).
3. **"Não me interessa":** marcar 5 notícias de GREVES como não-interessante e confirmar que a categoria some do topo nas próximas 20 notícias.
4. **Notícia urgente:** publicar uma notícia com `temperatura: "muito"` e confirmar que continua a aparecer perto do topo mesmo sem afinidade (via `atualidade` + tag URGENTE).
5. **Desligar personalização:** confirmar que a ordem volta a ser puramente cronológica (por `ts`) e os rótulos de recomendação desaparecem.
6. **Scroll infinito:** confirmar que carregar mais notícias não duplica cards nem muda a ordem dos já renderizados (a reordenação só corre em `applyFilter`, nunca durante o append).

## 7. Métricas a acompanhar

Retorno em 1/7/30 dias · leitura completa · tempo ativo de leitura · guardados · partilhas · cliques em fontes · pesquisas concluídas · "não me interessa" por notícia/categoria · diversidade de categorias e países vistos por sessão · satisfação (ex.: pesquisa curta opcional). Evitar otimizar só por tempo total no site, número de cliques ou conteúdo polémico.

## 8. Riscos e como são mitigados aqui

| Risco | Mitigação atual |
|---|---|
| Bolha de informação | Blocos de 20% recente + 15% diverso + 5% descoberta, e `diversificarFeed` limita repetição consecutiva |
| Conteúdo emocional/polémico dominar | Pontuação não usa reações/likes de comentários como sinal de "engajamento geral"; usa apenas sinais diretos de leitura da própria pessoa |
| Perda de confiança por personalização opaca | Rótulo "Porque lês sobre…" em cada notícia + interruptor para desligar |
| Utilizador novo sem dados | Fallback automático para atualidade (feed quase cronológico) |
| Dados sensíveis no Firebase | Só pontuações agregadas por categoria/país/setor; nada de texto lido, IP ou nome |
| Escrita de eventos sem limite | Documentado: mover para Cloud Function/API com limite de frequência (próximo passo) |

## 9. Melhorias futuras

- Cloud Function para registar eventos (em vez de escrita direta do browser), com limite de frequência por utilizador.
- Tabela de confiabilidade por fonte, para a "qualidade da fonte" deixar de ser um proxy.
- Recomendações por similaridade de texto entre notícias (embeddings) para a fase 3.
- Painel de administração para ver, agregado, quais categorias/países mais rejeitados (`not_interested`), como sinal editorial.
- Resumo semanal por e-mail/notificação com base no perfil, com frequência controlável pelo utilizador.
