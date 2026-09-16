# Raio-X do Mercado

Ferramenta gratuita de análise histórica pré-jogo para apoiar decisões de aposta esportiva. Escolha campeonato, time, condição de mando (mandante/visitante) e mercado — a ferramenta cruza o histórico e mostra a taxa de acerto, além de uma previsão estatística (modelo de Poisson ataque/defesa) quando um adversário é informado.

**Não é tempo real.** A base é atualizada uma vez por dia, automaticamente. Não há acompanhamento de jogos ao vivo.

⚠️ Isto é uma ferramenta de apoio à análise estatística sobre dados históricos — não é garantia de resultado nem recomendação de aposta. Aposte com responsabilidade.

## Como funciona

- **Fonte de dados**: [football-data.co.uk](https://www.football-data.co.uk) (gratuita, sem necessidade de cadastro), 34 campeonatos — ligas "principais" (dado completo: gols, intervalo, escanteios, cartões, odds) e ligas "extras" (só gols, resultado e odds).
- **Retrospecto**: taxa de acerto do time no mercado escolhido, nos últimos N jogos jogando em casa ou fora.
- **Previsão do modelo**: quando um adversário é informado, um modelo de Poisson (força de ataque/defesa relativa à média da liga) estima a probabilidade do mercado para aquele confronto específico.
- **Confiança validada por backtest**: a probabilidade do modelo é comparada contra um backtest walk-forward (sem vazamento de dados futuros) rodado para cada liga — o app mostra o acerto real observado historicamente naquela faixa de probabilidade, e avisa quando um mercado não teve sinal confiável (ex.: BTTS e Over/Under 2.5 gols, que historicamente ficam perto de 50-60% mesmo em alta confiança do modelo).

## Estrutura

```
index.html            # site (client-side, sem backend)
poisson-model.js       # motor estatístico (Poisson ataque/defesa), roda no navegador
backtest.js             # backtest walk-forward por liga -> data/calibracao.json
scripts/fetch-leagues.js  # baixa e normaliza os dados de todas as ligas
data/leagues.json          # catálogo de campeonatos disponíveis
data/matches/{CODIGO}.json  # partidas por liga
data/calibracao.json         # tabela de calibração do backtest por liga/mercado
server.js                     # servidor estático simples, só para desenvolvimento local
```

## Atualização automática

`.github/workflows/refresh_data.yml` roda todo dia às 06:00 UTC (GitHub Actions, gratuito), baixa os resultados mais recentes, recalcula o backtest e comita os dados atualizados de volta no repositório — sem depender de nenhum computador ligado.

## Rodando localmente

```
node scripts/fetch-leagues.js   # baixa os dados (demora ~1-2 min)
node backtest.js                 # gera a calibração do backtest
node server.js                    # sobe o site em http://localhost:5173
```
