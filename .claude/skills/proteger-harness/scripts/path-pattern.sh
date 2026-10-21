# O padrão de caminho das listas do harness, com um significado só: o da lista de arquivos protegidos, que a Guarda
# lê, e o dos pontos de convergência, que o núcleo das frentes lê. O caminho é relativo à raiz do repositório; o `*`
# casa dentro de um nível de pasta, o `**` atravessa as barras (como no glob de pathspec do Git), e o resto é literal.
# Quem carrega este arquivo com `source` recebe a função `pattern_regex`, que transforma o padrão numa expressão
# regular inteira: quem confere muitos caminhos contra a mesma lista a monta uma vez e casa com `[[ =~ ]]`.

# pattern_regex <padrão>
pattern_regex() {
  local pattern="$1" regex="" char i
  for ((i = 0; i < ${#pattern}; i++)); do
    char="${pattern:i:1}"
    case "$char" in
      '*')
        if [[ "${pattern:i+1:1}" == '*' ]]; then
          regex+='.*'
          i=$((i + 1))
        else
          regex+='[^/]*'
        fi
        ;;
      [[:alnum:]_/-]) regex+="$char" ;;
      *) regex+="\\$char" ;;
    esac
  done
  printf '^%s$' "$regex"
}
