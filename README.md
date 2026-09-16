# Raio-X do Mercado

Site gratuito de análise histórica pré-jogo pra apoiar decisões de aposta esportiva. Site ao vivo: **https://4allnerd-maker.github.io/raio-x-mercado/**

Este documento explica o que a ferramenta faz, de onde vêm os dados e como o motor estatístico funciona — pra quem quiser entender o "por dentro" antes de usar ou de apresentar o projeto pra outras pessoas.

⚠️ **Antes de tudo**: isto é uma ferramenta de análise estatística sobre dados históricos, não uma máquina de prever resultados. Leia a página [Jogo Responsável](responsavel.html) do site.

---

## 1. Visão geral: o que o site tem

| Página | O que faz |
|---|---|
| **Início** | Hub de navegação entre as outras páginas. |
| **Análise** | Escolha campeonato, time, condição (mandante/visitante) e mercado — mostra o retrospecto histórico (últimos N jogos) e, se você informar um adversário, a previsão do motor estatístico pro confronto. |
| **Classificação** | Tabela de classificação (geral, casa ou fora) de qualquer campeonato/temporada da base, calculada a partir dos resultados. |
| **Próximos Jogos** | Calendário dos confrontos futuros disponíveis na fonte gratuita, com link direto pra já abrir a análise daquele jogo. |
| **Rankings** | Comparativo entre campeonatos (quais têm mais gols, mais BTTS, etc.) e ranking de times por mercado específico. |
| **Sinais** | Pra cada jogo do dia, mostra automaticamente o mercado mais consistente (com a explicação de por quê) e um montador de "múltiplas" por parâmetro (data, mercado, confiança mínima, quantidade de jogos). |
| **Jogo Responsável** | O que a ferramenta é e não é, e diretrizes de uso consciente. |

Tudo roda **direto no navegador** (não tem backend/servidor rodando o tempo todo) — o site lê arquivos de dados (JSON) gerados uma vez por dia. Isso é o que permite ele ser 100% gratuito de hospedar.

---

## 2. De onde vêm os dados

Fonte única: **[football-data.co.uk](https://www.football-data.co.uk)**, uma base pública e gratuita (sem necessidade de cadastro ou chave de API) mantida há muitos anos pela comunidade de apostas esportivas.

- **34 campeonatos**: 18 ligas "principais" (Inglaterra, Alemanha, Itália, Espanha, França, Holanda, Bélgica, Portugal, Turquia, Grécia, Escócia — com múltiplas divisões em alguns países) e 16 ligas "extras" (Brasil, Argentina, México, EUA, Áustria, China, Dinamarca, Finlândia, Irlanda, Japão, Noruega, Polônia, Romênia, Rússia, Suécia, Suíça).
- **Ligas principais**: dado completo — gols, gols no intervalo, chutes, escanteios, cartões, odds de várias casas.
- **Ligas extras** (Brasileirão incluso): só placar final, resultado e odds médias de fechamento. **Não têm** escanteios, cartões, nem gols no intervalo — por isso esses mercados só aparecem no site pras ligas principais.
- **Calendário de próximos jogos**: a fonte só publica isso pras ligas principais, e com poucos dias de antecedência. O Brasileirão e as outras ligas extras não têm calendário disponível nessa fonte gratuita ainda (ver seção "Limitações conhecidas").
- **Histórico**: até 10 temporadas por liga.

### Atualização automática

Um workflow do GitHub Actions (`.github/workflows/refresh_data.yml`) roda **todo dia às 06h UTC**, sozinho, nos servidores do GitHub (gratuito) — sem depender de nenhum computador ligado:

1. Baixa os resultados e o calendário mais recentes de todas as 34 ligas.
2. Recalcula as estatísticas por time (`scripts/team-stats.js`).
3. Roda o backtest de novo (`backtest.js` — ver seção 4).
4. Comita os arquivos atualizados de volta no repositório.

O GitHub Pages detecta o commit e publica a versão nova automaticamente.

---

## 3. Camada 1: retrospecto histórico (página Análise)

A parte mais simples: pra um time, numa condição (casa/fora) e um mercado (ex.: "Over 1.5 gols"), o site pega os últimos N jogos daquele time naquela condição e calcula quantos bateram aquele mercado. É estatística descritiva pura — conta o que já aconteceu, sem tentar prever nada.

Isso já é útil (mostra tendência recente), mas tem uma limitação óbvia: não leva em conta **quem é o adversário**. Um time que faz 3 gols contra times fracos pode não repetir isso contra um adversário forte. É pra resolver isso que entra a camada 2.

---

## 4. Camada 2: o motor estatístico (Poisson ataque/defesa)

Quando você informa um adversário na página Análise (ou em qualquer jogo na página Sinais), o site roda um modelo de probabilidade chamado **Poisson de ataque/defesa** — o mesmo princípio usado por praticamente todo modelo público sério de previsão de futebol (uma versão simplificada do que é conhecido como modelo Dixon-Coles).

### Como funciona, em termos simples

1. **Calcula a "força" de cada time** — não em valor absoluto, mas relativa à média da liga:
   - *Força de ataque em casa* = quantos gols o time costuma marcar jogando em casa, dividido pela média de gols que os mandantes fazem naquela liga.
   - *Força de defesa em casa* = quantos gols o time costuma sofrer jogando em casa, dividido pela média de gols que os visitantes fazem naquela liga.
   - O mesmo pro lado visitante.
   - Um valor de 1.20 significa "20% acima da média da liga"; 0.80 significa "20% abaixo".
   - Essas forças são calculadas numa janela dos últimos ~2 anos (pra captar o elenco atual), com um mínimo de jogos exigido — se não tiver jogos suficientes na janela recente, o modelo usa todo o histórico disponível em vez disso.

2. **Estima os gols esperados do confronto**: cruza a força de ataque de um time com a força de defesa do adversário (e a média histórica da liga), gerando um número de "gols esperados" pra cada lado (ex.: 1.8 x 0.9).

3. **Monta a distribuição de probabilidade completa do placar**, usando a fórmula de Poisson — que descreve bem a frequência de eventos raros e independentes, e gols num jogo de futebol se encaixam bem nesse padrão. Isso gera a probabilidade de cada placar possível (0x0, 1x0, 2x1, etc.).

4. **Soma as probabilidades por mercado**: por exemplo, "over 1.5 gols" é a soma da probabilidade de todos os placares com 2 gols ou mais.

O código desse motor está em [`poisson-model.js`](poisson-model.js) e roda inteiro no navegador de quem visita o site — não precisa de servidor.

### O que o modelo NÃO sabe

Ele não sabe de lesão de última hora, escalação, suspensão, clima, motivação específica de um jogo (final de copa, clássico, jogo sem nada em jogo no fim de temporada), nem notícias do dia. Ele só enxerga o padrão estatístico dos resultados passados. É uma estimativa, não uma certeza.

---

## 5. Camada 3: o backtest (por que confiar, e em quê)

Ter um modelo que calcula uma probabilidade é fácil. Saber se essa probabilidade **bate com a realidade** é a parte que separa uma ferramenta séria de "achismo com aparência de matemática". É pra isso que existe o backtest.

### Como o backtest funciona (`backtest.js`)

Pra cada liga, o script percorre **todos os jogos em ordem cronológica** e, pra cada jogo, roda o motor Poisson usando **só os jogos anteriores àquela data** — nunca usa informação do futuro pra "prever" o passado (isso se chama validação *walk-forward*, e é o cuidado mínimo pra um backtest não ser enganoso). Depois compara a probabilidade que o modelo deu com o que **realmente aconteceu** naquele jogo.

Isso é repetido milhares de vezes por liga, e os resultados são agrupados em faixas de probabilidade (ex.: "toda vez que o modelo disse entre 70% e 80% de confiança") — daí calcula-se a **taxa de acerto real observada** em cada faixa.

### Por que isso importa

Duas probabilidades de "70%" não valem a mesma coisa se uma vem de um modelo bem calibrado e a outra de um modelo ruim. O backtest é o que permite ao site dizer, com dado real: *"quando o modelo indicou algo parecido com isso no passado, o acerto de verdade foi X%, numa amostra de Y jogos"* — em vez de só confiar cegamente no número que o modelo cospe.

### O que o backtest mostrou (resultado real, específico pra cada liga)

Rodamos o backtest pra cada uma das 34 ligas separadamente (os números variam liga a liga, mas o padrão se repete):

- **Over 1.5 gols** e **Over 3.5 gols**: mercados com sinal consistente — o acerto real sobe de forma previsível conforme a probabilidade do modelo sobe.
- **Resultado (1X2 / vitória)**: razoavelmente bem calibrado, principalmente quando o modelo indica um favorito claro.
- **Over/Under 2.5 gols** e **Ambas Marcam (BTTS)**: sem sinal confiável — o acerto real fica travado perto de 50-60% mesmo quando o modelo indica alta probabilidade. Esses mercados aparecem no site marcados com aviso, e ficam de fora da seleção automática de "melhor mercado" na página Sinais.

Isso não é uma opinião nossa — é o que o teste retrospectivo mostrou nos dados. Se um dia os números mudarem (com mais dados ou um modelo melhor), o site vai refletir isso automaticamente, porque o backtest roda de novo toda vez que a base é atualizada.

---

## 6. Limitações conhecidas (importante ser honesto sobre isso)

- **Sem tempo real**: o site não acompanha jogos ao vivo, placar mudando, nada disso. É uma ferramenta de análise pré-jogo.
- **Calendário de próximos jogos limitado**: só cobre as ligas principais europeias, e só com poucos dias de antecedência — não é possível hoje ver o calendário futuro do Brasileirão nessa fonte gratuita.
- **Gols no intervalo, escanteios e cartões**: só existem pras ligas principais. Pro Brasileirão e as outras ligas extras, esses mercados não estão disponíveis (a fonte gratuita não traz esse dado pra essas ligas).
- **Minuto do gol**: não temos essa informação em nenhuma liga hoje. É por isso que o mercado "gols nos últimos 5-10 minutos" aparece no site como reservado, desabilitado — ele depende de uma fonte paga (tipo API-Football) que ainda não foi integrada.
- **O modelo não sabe de notícia do dia**: lesão, suspensão, escalação — nada disso entra na conta.

---

## 7. Estrutura técnica do projeto

```
index.html              # página inicial (hub de navegação)
analise.html              # ferramenta de análise por time/mercado
classificacao.html         # tabela de classificação
calendario.html              # calendário de próximos jogos
rankings.html                  # comparativos e ranking de times
sinais.html                      # sinais do dia + montador de múltiplas
responsavel.html                  # diretrizes de jogo responsável
styles.css                          # estilo compartilhado por todas as páginas

poisson-model.js       # motor estatístico (Poisson ataque/defesa) — roda no navegador
backtest.js               # valida o motor contra o histórico real, liga por liga

scripts/
  fetch-leagues.js         # baixa e normaliza os dados das 34 ligas + calendário
  team-stats.js               # pré-calcula estatísticas de time por mercado (usado nos Rankings)

data/
  leagues.json                # catálogo de campeonatos + agregados por liga
  fixtures.json                 # calendário de próximos jogos (ligas principais)
  calibracao.json                 # tabela de calibração do backtest, por liga/mercado
  matches/{CODIGO}.json             # jogos históricos de cada liga
  team-stats/{CODIGO}.json            # estatísticas pré-calculadas por time/liga

server.js                # servidor estático simples, só pra rodar localmente em desenvolvimento
.github/workflows/refresh_data.yml  # automação diária (GitHub Actions)
```

Sem framework, sem build step, sem dependência externa além das fontes do Google (tipografia). HTML/CSS/JS direto, hospedado como site estático no GitHub Pages.

### Rodando localmente

```bash
node scripts/fetch-leagues.js   # baixa os dados (demora ~1-2 min)
node scripts/team-stats.js       # calcula estatísticas por time
node backtest.js                   # gera a calibração do backtest
node server.js                       # sobe o site em http://localhost:5173
```

---

## 8. Sobre usar isso pra criar conteúdo / canal

Se você vai apresentar essa ferramenta publicamente (vídeo, canal, redes sociais):

- Deixe claro que é uma ferramenta de análise estatística, não uma "fórmula infalível" — isso protege você e quem assiste.
- Sempre que mostrar um número de "confiança" ou "probabilidade", mostre junto a taxa de acerto real do backtest (o site já faz isso automaticamente) — é o que dá credibilidade de verdade, em vez de só prometer.
- Reforce que passado não garante futuro, mesmo com validação.
- A página [Jogo Responsável](responsavel.html) foi pensada exatamente pra ter um lugar de referência pra linkar quando for preciso.

---

## 9. Aviso legal

⚠️ Esta ferramenta serve apenas para análise estatística de dados históricos. Não é garantia de resultado nem recomendação de aposta. Apostas esportivas envolvem risco financeiro real — jogue com responsabilidade, e apenas se for maior de idade.
