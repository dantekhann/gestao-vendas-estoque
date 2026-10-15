'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { registarMovimentacaoEstoque, PROPORCAO_VELCRO_PAR_PACOTE } from '@/lib/estoque'
import type { Produto } from '@/lib/types'

export default function MovimentarEstoquePage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const supabase = createClient()
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [mostrarDropdown, setMostrarDropdown] = useState<boolean>(false);
  const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA' | 'AJUSTE'>('ENTRADA');
  const [quantidade, setQuantidade] = useState<number>(1);
  const [unidadeVelcro, setUnidadeVelcro] = useState<'pares' | 'pacotes'>('pares');
  const [observacao, setObservacao] = useState<string>('');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Detecta se o produto selecionado é velcro (exibe o seletor de unidade)
  const ehVelcro = produtoSelecionado?.nome.toLowerCase().includes('velcro') || false;

  const carregarProdutos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, sku, estoque_atual')
        .eq('ativo', true)
        .order('nome', { ascending: true });
      if (error) throw error;
      if (data) setProdutos(data);
    } catch {
      setErro('Erro ao carregar lista de produtos.');
    }
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      if (isMounted) {
        await carregarProdutos();
      }
    }
    init();
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMostrarDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      isMounted = false;
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [carregarProdutos]);

  const produtosFiltrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(termoBusca.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(termoBusca.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (carregando) return;
    setCarregando(true);
    setErro(null);
    setSucesso(null);

    if (!produtoSelecionado) {
      setErro('Selecione um produto da lista.');
      setCarregando(false);
      return;
    }
    if (quantidade <= 0) {
      setErro('A quantidade deve ser maior que zero.');
      setCarregando(false);
      return;
    }

    try {
      // Conversão de unidade para velcro: pacotes → pares
      let quantidadeFinal = Number(quantidade);
      let textoUnidade = '';

      if (ehVelcro && unidadeVelcro === 'pacotes') {
        const pares = quantidadeFinal * PROPORCAO_VELCRO_PAR_PACOTE;
        textoUnidade = `${quantidadeFinal} pacote(s) = ${pares} pares`;
        quantidadeFinal = pares;
      }

      const dataHoje = new Date().toISOString().split('T')[0];
      const partesObs = [textoUnidade, observacao].filter(Boolean).join(' | ');
      const obsComData = `[Data: ${dataHoje}] ${partesObs}`.trim();

      await registarMovimentacaoEstoque({
        produtoId: produtoSelecionado.id,
        tipo,
        quantidade: quantidadeFinal,
        observacao: obsComData,
        sincronizarVelcro: false, // a conversão de unidade acontece aqui na página
      });

      setSucesso(
        `Movimentação registrada: ${tipo} de ${quantidadeFinal} un em ${produtoSelecionado.nome}${textoUnidade ? ` (${textoUnidade})` : ''}.`
      );

      // Limpa o formulário para o próximo lançamento
      setProdutoSelecionado(null);
      setTermoBusca('');
      setQuantidade(1);
      setUnidadeVelcro('pares');
      setObservacao('');
      setCarregando(false);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      console.error('Erro ao registar movimentação:', errorObj);
      setErro(errorObj?.message || 'Erro ao processar movimentação.');
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-center">
      <div className="max-w-xl w-full space-y-6">
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Lançar Movimentação</h1>
            <p className="text-xs text-slate-400 mt-1">Entrada, Saída ou Ajuste Manual de Estoque - OrC Brasil</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/movimentacoes')}
            className="px-3.5 py-2 text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 cursor-pointer"
          >
            ← Voltar
          </button>
        </div>
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-5">
          {erro && (
            <div className="p-3.5 border border-red-500/30 bg-red-950/50 text-red-400 rounded-xl text-sm">
              {erro}
            </div>
          )}
          {sucesso && (
            <div className="p-3.5 border border-emerald-500/30 bg-emerald-950/50 text-emerald-400 rounded-xl text-sm">
              ✅ {sucesso}
            </div>
          )}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              BUSCAR E SELECIONAR ITEM
            </label>
            <input
              type="text"
              placeholder="Digite para buscar (ex: Yerba, Velcro...)"
              value={produtoSelecionado ? produtoSelecionado.nome : termoBusca}
              onFocus={() => setMostrarDropdown(true)}
              onChange={(e) => {
                setTermoBusca(e.target.value);
                setProdutoSelecionado(null);
                setMostrarDropdown(true);
              }}
              className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-amber-500/90 font-medium">
              * Clique ou digite no campo acima para filtrar a lista instantaneamente.
            </p>
            {!produtoSelecionado && mostrarDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl max-h-52 overflow-y-auto divide-y divide-slate-800">
                {produtosFiltrados.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500 text-center">Nenhum produto encontrado.</div>
                ) : (
                  produtosFiltrados.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setProdutoSelecionado(p);
                        setTermoBusca('');
                        setMostrarDropdown(false);
                      }}
                      className="p-3 text-sm hover:bg-slate-800/80 cursor-pointer flex justify-between items-center transition-colors"
                    >
                      <span className="font-semibold text-white">{p.nome}</span>
                      <span className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
                        Estoque: {p.estoque_atual}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          {produtoSelecionado && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-xl flex justify-between items-center text-sm">
              <div>
                <span className="text-xs text-slate-400 block">Produto Selecionado:</span>
                <strong className="text-emerald-400 font-bold">{produtoSelecionado.nome}</strong> (Atual: {produtoSelecionado.estoque_atual})
              </div>
              <button
                type="button"
                onClick={() => {
                  setProdutoSelecionado(null);
                  setMostrarDropdown(true);
                }}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
              >
                Alterar
              </button>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              TIPO DE MOVIMENTAÇÃO
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipo('ENTRADA')}
                className={`py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  tipo === 'ENTRADA'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setTipo('SAIDA')}
                className={`py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  tipo === 'SAIDA'
                    ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-950'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Saída
              </button>
              <button
                type="button"
                onClick={() => setTipo('AJUSTE')}
                className={`py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  tipo === 'AJUSTE'
                    ? 'bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-950'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Ajuste Manual
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              QUANTIDADE
            </label>
            <input
              type="number"
              min="1"
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
              required
              className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {ehVelcro && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                UNIDADE DO VELCRO
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUnidadeVelcro('pares')}
                  className={`py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    unidadeVelcro === 'pares'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-950'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Pares
                </button>
                <button
                  type="button"
                  onClick={() => setUnidadeVelcro('pacotes')}
                  className={`py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    unidadeVelcro === 'pacotes'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-950'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Pacotes (1 = {PROPORCAO_VELCRO_PAR_PACOTE} pares)
                </button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              OBSERVAÇÃO (OPCIONAL)
            </label>
            <textarea
              rows={3}
              placeholder="Ex: Reposição de lote, contagem física..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={carregando || !produtoSelecionado}
              className="w-full py-3.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-950 disabled:opacity-50 cursor-pointer"
            >
              {carregando ? 'A processar...' : 'Confirmar e Atualizar Estoque'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}