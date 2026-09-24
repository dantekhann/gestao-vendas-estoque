'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  nome: string;
  sku?: string;
  estoque_atual: number;
}

export default function MovimentarEstoquePage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [mostrarDropdown, setMostrarDropdown] = useState<boolean>(false);
  
  const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA' | 'AJUSTE'>('ENTRADA');
  const [quantidade, setQuantidade] = useState<number>(1);
  const [observacao, setObservacao] = useState<string>('');
  
  const [carregando, setCarregando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  const carregarProdutos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, sku, estoque_atual')
        .eq('ativo', true) // Filtra apenas os produtos ativos
        .order('nome', { ascending: true });

      if (error) throw error;
      if (data) setProdutos(data);
    } catch {
      setErro('Erro ao carregar lista de produtos.');
    }
  }, []);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!produtoSelecionado) {
      setErro('Selecione um produto da lista.');
      return;
    }
    if (quantidade <= 0) {
      setErro('A quantidade deve ser maior que zero.');
      return;
    }

    try {
      setCarregando(true);
      setErro(null);

      const estoqueAtual = Number(produtoSelecionado.estoque_atual) || 0;
      let novoEstoque = estoqueAtual;

      if (tipo === 'ENTRADA') {
        novoEstoque += Number(quantidade);
      } else if (tipo === 'SAIDA') {
        novoEstoque -= Number(quantidade);
      } else if (tipo === 'AJUSTE') {
        novoEstoque = Number(quantidade);
      }

      if (novoEstoque < 0) {
        throw new Error('A operação resultaria num estoque negativo.');
      }

      // 1. Atualizar estoque na tabela produtos
      const { error: errUpdate } = await supabase
        .from('produtos')
        .update({ estoque_atual: novoEstoque })
        .eq('id', produtoSelecionado.id);

      if (errUpdate) throw errUpdate;

      // 2. Registar movimentação
      const dataHoje = new Date().toISOString().split('T')[0];
      const obsComData = `[Data: ${dataHoje}] ${observacao}`.trim();

      const { error: errMov } = await supabase.from('movimentacoes_estoque').insert([
        {
          produto_id: produtoSelecionado.id,
          tipo,
          quantidade: tipo === 'AJUSTE' ? Math.abs(novoEstoque - estoqueAtual) : Number(quantidade),
          observacao: obsComData,
        },
      ]);

      if (errMov) throw errMov;

      router.push('/movimentacoes');
      router.refresh();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      console.error('Erro ao registar movimentação:', errorObj);
      setErro(errorObj?.message || 'Erro ao processar movimentação.');
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-center">
      <div className="max-w-xl w-full space-y-6">
        
        {/* Cabeçalho */}
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

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-5">
          {erro && (
            <div className="p-3.5 border border-red-500/30 bg-red-950/50 text-red-400 rounded-xl text-sm">
              {erro}
            </div>
          )}

          {/* Campo de Busca de Item com Dropdown Flutuante */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              BUSCAR E SELECIONAR ITEM
            </label>
            <input
              type="text"
              placeholder="Digite para buscar (ex: Yerba, Caixa, Alcool...)"
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

            {/* Lista suspensa (Dropdown) */}
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

          {/* Tipo de Movimentação */}
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

          {/* Quantidade */}
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

          {/* Observação */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              OBSERVAÇÃO (OPCIONAL)
            </label>
            <textarea
              rows={3}
              placeholder="Ex: Reposição de lote, contagem física, acerto de inventário..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Botão de Confirmação */}
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