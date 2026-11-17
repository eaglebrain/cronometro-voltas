# Cronômetro de voltas

Cronômetro de voltas com progressão φ (1,618): cada volta é a anterior multiplicada (ou dividida) pela razão áurea. Site estático, sem build e sem dependências.

- Produção (Vercel): https://cronometro-voltas.vercel.app
- Espelho (GitHub Pages): https://eaglebrain.github.io/cronometro-voltas/
- Repositório: https://github.com/eaglebrain/cronometro-voltas

## Funcionalidades

- **Voltas em φ** — modo direto (`×φ`) ou inverso (`÷φ`), com confirmação manual entre voltas.
- **Etiqueta da rodada** — cor e descrição pertencem à rodada, isto é, à sequência contínua de voltas em φ da sessão. A etiqueta persiste entre voltas e alterações nela atualizam a rodada inteira; a cor tinge o fundo de forma discreta.
- **Retomar uma volta** — clique numa volta concluída para rodá-la de novo com o mesmo tempo. Durante uma volta em andamento, o app pede confirmação; a partir do preparo, inicia uma nova rodada herdando a etiqueta daquela volta.
- **Presets** — 30 s, 1, 2, 3 e 5 min, além de presets personalizados persistidos no navegador.
- **Fim de volta** — som curto, popup na tela e notificação do sistema (quando permitida).
- **Projeção** — gráfico e tabela das próximas 12 voltas.
- **Atalhos** — central de ajuda com `?`.

## Atalhos

| Tecla | Ação |
|---|---|
| `Espaço` | iniciar / confirmar a próxima volta |
| `P` | parar a sessão (pede confirmação; `P` de novo confirma) |
| `Esc` | fechar diálogo ou popup (mantém a volta em andamento) |
| `↑` `↓` | ajustar a primeira volta em ±1 s (`Shift` = ±10 s) |
| `1`–`9`, `0` | escolher preset (1–9 e o décimo) |
| `T` | focar o tempo manual (`Enter` inicia) |
| `D` / `I` | progressão direta / inversa |
| `E` | etiquetar a volta atual (cor + descrição) |
| `A` | criar/remover preset personalizado |
| `V` | abrir a projeção |
| `N` | notificações do navegador on/off |
| `?` | mostrar os atalhos |

Atalhos são ignorados enquanto o foco está em campos de texto e quando há um diálogo aberto (exceto `P` no diálogo de parada e `Esc`).

## Como rodar localmente

Não há etapa de build. Sirva a pasta com qualquer servidor estático:

```bash
python -m http.server 8000
```

Abra `http://127.0.0.1:8000/`. Um servidor local é recomendado: `file://` pode bloquear `Notification` e restringir `localStorage`.

## Estrutura

```
index.html   marcação, diálogos e controles
styles.css   tema escuro, dial, tint da etiqueta, diálogos e responsivo
app.js       estado, ciclo das voltas, projeção, áudio, notificações, atalhos e presets
```

Sem frameworks, bundler ou dependências de runtime.

## Estado e armazenamento

O estado da sessão (voltas concluídas, etiqueta atual, tempo) vive apenas em memória e é perdido ao recarregar. Apenas preferências são persistidas em `localStorage`:

| Chave | Conteúdo |
|---|---|
| `voltas:presets` | array JSON de presets personalizados em segundos |
| `voltas:notify` | `"on"` ou `"off"` para notificações do navegador |

## Deploy

- **Vercel** (produção): `vercel deploy --prod`. O vínculo do projeto fica em `.vercel/` e o token local em `.env.local`; ambos são ignorados pelo Git.
- **GitHub Pages**: publica a raiz da branch `main`; não requer ação manual além do push.

O fluxo usado é branch → pull request → squash em `main` → deploy de produção na Vercel.

## Compatibilidade

Navegadores modernos com `<dialog>`, `requestAnimationFrame`, Web Audio e `localStorage`. `Notification` é opcional: sem permissão, o aviso de fim de volta continua aparecendo como popup na página.
