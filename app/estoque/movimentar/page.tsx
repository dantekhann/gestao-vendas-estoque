'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  sku: string;
  nome: string;
  estoque_atual: number;
  tipo: string;
}

export default function MovimentarEstoquePage() {
  const router = useRouter();

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário de Lançamento
  const [produtoId, setProdutoId] = useState<string>('');
  const [tipoMovimentacao, setTipoMovimentacao] = useState<'ENTRADA' | 'SAIDA' | 'AJUSTE'>('ENTRADA');
  const [quantidade, setQuantidade] = useState<number>(1);
  const [observacao, setObservacao] = useState<string>('');
  const [salvando, setSalvando] = useState<boolean>(false);

  // Carrega TODOS os itens (Insumos, Embalagens, Produto Final, Almoxarifado)
  useEffect(() => {
    async function carregarProdutos() {
      try {
        setCarregandoProdutos(true);
        setErro(null);

        const { data, error } = await supabase
          .from('produtos')
          .select('id, sku, nome, estoque_atual, tipo')
          .order('nome', { ascending: true });

        if (error) throw error;
        if (data) setProdutos(data);
      } catch (err: any) {
        console.error('Erro ao buscar produtos:', err);
        setErro(err.message || 'Erro ao carregar lista de itens.');
      } finally {
        setCarregandoProdutos(false);
      }
    }

    carregarProdutos();
  }, []);

  const produtoSelecionado = produtos.find((p) => p.id === produtoId);

  const formatarTipo = (tipo: string) => {
    if (!tipo) return '';
    return tipo.replace(/_/g, ' ');
  };

  const handleSalvarMovimentacao = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!produtoId) {
      alert('Selecione um item/produto.');
      return;
    }

    if (quantidade <= 0 && tipoMovimentacao !== 'AJUSTE') {
      alert('A quantidade deve ser maior que zero.');
      return;
    }

    setSalvando(true);

    try {
      // 1. Registra a movimentação no histórico
      const { error: errorMov } = await supabase
        .from('movimentacoes_estoque')
        .insert([
          {
            produto_id: produtoId,
            tipo: tipoMovimentacao,
            quantidade: quantidade,
            observacao: observacao || `Lançamento manual de ${tipoMovimentacao.toLowerCase()}`,
          },
        ]);

      if (errorMov) throw errorMov;

      // 2. Se o banco não possuir Trigger automático, atualiza o estoque diretamente na tabela produtos:
      let novoEstoque = produtoSelecionado?.estoque_atual || 0;
      if (tipoMovimentacao === 'ENTRADA') novoEstoque += quantidade;
      if (tipoMovimentacao === 'SAIDA') novoEstoque -= quantidade;
      if (tipoMovimentacao === 'AJUSTE') novoEstoque = quantidade;

      const { error: errorProd } = await supabase
        .from('produtos')
        .update({ estoque_atual: novoEstoque })
        .eq('id', produtoId);

      if (errorProd) throw errorProd;

      alert('Movimentação realizada com sucesso!');
      router.push('/');
      router.refresh();
    } catch (err: any) {
      console.error('Erro ao registrar movimentação:', err);
      alert(`Erro: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-center bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Lançar Movimentação</h1>
            <p className="text-sm text-slate-400">Entradas, saídas e ajustes manuais de estoque</p>
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            Voltar
          </button>
        </div>

        {/* Formulário em Dark Mode */}
        <form onSubmit={handleSalvarMovimentacao} className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-5">
          
          {/* Seleção do Item */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">
              Selecione o Item (Produto, Embalagem, Insumo, etc.)
            </label>
            {carregandoProdutos ? (
              <div className="p-2.5 border border-slate-800 rounded-lg bg-slate-950 text-slate-500 text-sm animate-pulse">
                Carregando lista de itens...
              </div>
            ) : erro ? (
              <div className="p-2.5 border border-red-500/30 bg-red-950/50 text-red-400 text-sm rounded-lg">
                {erro}
              </div>
            ) : (
              <select
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                required
              >
                <option value="" className="text-slate-500 bg-slate-900">Selecione um item...</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100 py-1">
                    [{formatarTipo(p.tipo)}] {p.nome} — Atual: {p.estoque_atual} un
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Resumo do Produto Selecionado */}
          {produtoSelecionado && (
            <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800/80 text-sm flex justify-between items-center">
              <div>
                <span className="text-slate-400">Estoque Atual: </span>
                <span className="font-bold text-white">{produtoSelecionado.estoque_atual} un</span>
              </div>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {formatarTipo(produtoSelecionado.tipo)}
              </span>
            </div>
          )}

          {/* Tipo de Operação */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Tipo de Movimentação
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setTipoMovimentacao('ENTRADA')}
                className={`py-2.5 px-4 rounded-lg font-bold text-sm border transition-all ${
                  tipoMovimentacao === 'ENTRADA'
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-600 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800/50'
                }`}
              >
                + ENTRADA
              </button>

              <button
                type="button"
                onClick={() => setTipoMovimentacao('SAIDA')}
                className={`py-2.5 px-4 rounded-lg font-bold text-sm border transition-all ${
                  tipoMovimentacao === 'SAIDA'
                    ? 'bg-red-950 text-red-400 border-red-600 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800/50'
                }`}
              >
                - SAÍDA
              </button>

              <button
                type="button"
                onClick={() => setTipoMovimentacao('AJUSTE')}
                className={`py-2.5 px-4 rounded-lg font-bold text-sm border transition-all ${
                  tipoMovimentacao === 'AJUSTE'
                    ? 'bg-amber-950 text-amber-400 border-amber-600 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800/50'
                }`}
              >
                = AJUSTE (Balanço)
              </button>
            </div>
          </div>

          {/* Quantidade */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">
              {tipoMovimentacao === 'AJUSTE' ? 'Nova Quantidade Exata do Estoque' : 'Quantidade a Movimentar'}
            </label>
            <input
              type="number"
              min="0"
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
              className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          {/* Observação / Nota / Fornecedor */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">
              Observação / Motivo (Opcional)
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Chegada de lote de embalagens, Nota Fiscal #1234, descarte, etc."
              className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Botão de Envio */}
          <button
            type="submit"
            disabled={salvando || carregandoProdutos}
            className={`w-full py-3.5 rounded-lg font-bold text-base transition-colors shadow-sm disabled:opacity-50 ${
              tipoMovimentacao === 'ENTRADA' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' :
              tipoMovimentacao === 'SAIDA' ? 'bg-red-600 hover:bg-red-500 text-white' :
              'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {salvando ? 'Gravando no banco...' : 'Confirmar Movimentação'}
          </button>
        </form>

      </div>
    </div>
  );
}