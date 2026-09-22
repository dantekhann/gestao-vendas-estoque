'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  nome: string;
  estoque_atual: number;
}

export default function MovimentarEstoquePage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  // Estados do formulário
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [mostrarDropdown, setMostrarDropdown] = useState<boolean>(false);
  
  const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA' | 'AJUSTE'>('ENTRADA');
  const [quantidade, setQuantidade] = useState<string>('1');
  const [observacao, setObservacao] = useState<string>('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function carregarProdutos() {
      try {
        setCarregando(true);
        const { data, error } = await supabase
          .from('produtos')
          .select('id, nome, estoque_atual')
          .order('nome', { ascending: true });

        if (error) throw error;
        if (data) setProdutos(data);
      } catch (err: any) {
        setErro(err?.message || 'Erro ao carregar produtos.');
      } finally {
        setCarregando(false);
      }
    }
    carregarProdutos();

    // Fecha o menu suspenso se clicar fora
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMostrarDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrar produtos com base no que é digitado
  const produtosFiltrados = produtos.filter((p) =>
    p.nome.toLowerCase().includes(termoBusca.toLowerCase().trim())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!produtoSelecionado) {
      alert('Por favor, selecione um produto da lista.');
      return;
    }

    const qtdNum = parseInt(quantidade, 10);
    if (isNaN(qtdNum) || qtdNum <= 0) {
      alert('Insira uma quantidade válida.');
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      // Data atual formatada para auditoria
      const hoje = new Date().toISOString().split('T')[0];
      const obsFormatada = `[Data: ${hoje}] ${observacao}`.trim();

      // 1. Registrar a movimentação na tabela
      const { error: movError } = await supabase.from('movimentacoes_estoque').insert([
        {
          produto_id: produtoSelecionado.id,
          tipo,
          quantidade: qtdNum,
          observacao: obsFormatada,
        },
      ]);

      if (movError) throw movError;

      // 2. Calcular novo estoque
      let novoEstoque = produtoSelecionado.estoque_atual;
      if (tipo === 'ENTRADA') {
        novoEstoque += qtdNum;
      } else if (tipo === 'SAIDA') {
        novoEstoque -= qtdNum;
      } else if (tipo === 'AJUSTE') {
        novoEstoque = qtdNum;
      }

      // 3. Atualizar estoque na tabela de produtos
      const { error: prodError } = await supabase
        .from('produtos')
        .update({ estoque_atual: Math.max(0, novoEstoque) })
        .eq('id', produtoSelecionado.id);

      if (prodError) throw prodError;

      alert('Movimentação registrada e estoque atualizado com sucesso!');
      router.push('/estoque/movimentacoes');
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setErro(err?.message || 'Erro ao salvar movimentação.');
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
            <p className="text-sm text-slate-400">Entrada, Saída ou Ajuste Manual de Estoque - OrC Brasil</p>
          </div>
          <Link
            href="/estoque/movimentacoes"
            className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            ← Voltar
          </Link>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-5">
          
          {erro && (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-sm">
              {erro}
            </div>
          )}

          {/* Campo de Busca por Texto do Produto */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-medium text-slate-400 mb-1">Buscar e Selecionar Item</label>
            <input
              type="text"
              placeholder="Digite para buscar (ex: Yerba, Caixa, Álcool...)"
              value={termoBusca}
              onChange={(e) => {
                setTermoBusca(e.target.value);
                setMostrarDropdown(true);
                if (produtoSelecionado && e.target.value !== produtoSelecionado.nome) {
                  setProdutoSelecionado(null);
                }
              }}
              onFocus={() => setMostrarDropdown(true)}
              className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />

            {mostrarDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                {carregando ? (
                  <div className="p-3 text-sm text-slate-400 text-center">Carregando itens...</div>
                ) : produtosFiltrados.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500 text-center">Nenhum item encontrado.</div>
                ) : (
                  produtosFiltrados.map((prod) => (
                    <div
                      key={prod.id}
                      onClick={() => {
                        setProdutoSelecionado(prod);
                        setTermoBusca(prod.nome);
                        setMostrarDropdown(false);
                      }}
                      className="p-3 text-sm hover:bg-slate-800 cursor-pointer flex justify-between items-center border-b border-slate-800/50 last:border-none"
                    >
                      <span className="font-medium text-slate-200">{prod.nome}</span>
                      <span className="text-xs text-slate-400 bg-slate-950 px-2 py-1 rounded">
                        Estoque: {prod.estoque_atual}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {produtoSelecionado ? (
              <p className="text-xs text-emerald-400 mt-1 font-medium">
                ✓ Selecionado: {produtoSelecionado.nome} (Estoque atual: {produtoSelecionado.estoque_atual})
              </p>
            ) : (
              <p className="text-xs text-amber-400/80 mt-1">
                * Digite no campo acima para filtrar a lista instantaneamente.
              </p>
            )}
          </div>

          {/* Botões de Tipo de Movimentação */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de Movimentação</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipo('ENTRADA')}
                className={`py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors border ${
                  tipo === 'ENTRADA'
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setTipo('SAIDA')}
                className={`py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors border ${
                  tipo === 'SAIDA'
                    ? 'bg-rose-600 border-rose-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Saída
              </button>
              <button
                type="button"
                onClick={() => setTipo('AJUSTE')}
                className={`py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors border ${
                  tipo === 'AJUSTE'
                    ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Ajuste Manual
              </button>
            </div>
          </div>

          {/* Quantidade */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {tipo === 'AJUSTE' ? 'Novo Valor Total de Estoque' : 'Quantidade'}
            </label>
            <input
              type="number"
              min="1"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              required
              className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Observação */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Observação (Opcional)</label>
            <textarea
              rows={3}
              placeholder="Ex: Reposição de lote, contagem física, acerto de inventário..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Botão Submeter */}
          <button
            type="submit"
            disabled={salvando || !produtoSelecionado}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {salvando ? 'Registrando movimentação...' : 'Confirmar e Atualizar Estoque'}
          </button>

        </form>

      </div>
    </div>
  );
}