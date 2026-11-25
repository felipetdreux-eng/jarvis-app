# Jarvis App

App de area de trabalho que abre a pagina do **seu** Jarvis e tem um dock de botoes que lancam abas e programas.

- Mac (Catalina 10.15 ou mais novo) e Windows.
- Nao leva nenhum dado pessoal dentro. Na primeira vez pede o endereco da sua pagina.
- Electron 32 de proposito: e a ultima versao que roda no macOS Catalina.

## Baixar
Aba **Releases** do repositorio: `.dmg` (Mac) ou `.exe` (Windows).

Mac sem assinatura da Apple: no primeiro uso, clique com o botao direito no app e escolha **Abrir**.

## Botoes
Menu **Editar botoes** abre o `config.json`. Tipos:
- `urls`: abre varias abas no Chrome (`"browser": "default"` usa o navegador padrao)
- `app`: abre um programa (`"target": "Obsidian"`)
- `path`: abre uma pasta ou arquivo

A pagina do Jarvis nunca manda comandos: so o app le o `config.json`.
