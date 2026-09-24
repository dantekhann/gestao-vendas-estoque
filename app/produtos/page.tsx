'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  nome: string;
  classificacao?: string;
  preco_venda: number;
  estoque_atual: number;
  estoque_minimo?: number;
}

const OPCOES_CLASSIFICACAO = [
  'Produto Finalizado',
  'Insumo (Matéria-Prima)',
  'Almoxarifado (Consumo Interno)',
  'Embalagem',
  'EPI'
];

export default function ProdutosAdminPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroBusca, setFiltroBusca] = useState<string>('');

  // Estados para Adicionar Novo Produto
  const [novoNome, setNovoNome] = useState<string>('');
  const [novaClassificacao, setNovaClassificacao] = useState<string>('Produto Finalizado');
  const [novoPreco, setNovoPreco] = useState<string>('0.00');
  const [novoEstoque, setNovoEstoque] = useState<string>('0');
  const [novoEstoqueMinimo, setNovoEstoqueMinimo] = useState<string>('0');
  const [salvandoNovo, setSalvandoNovo] = useState<boolean>(false);

  // Estados para Edição Inline
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState<string>('');
  const [editClassificacao, setEditClassificacao] = useState<string>('');
  const [editPreco, setEditPreco] = useState<string>('');
  const [editEstoque, setEditEstoque] = useState<string>('');
  const [editEstoqueMinimo, setEditEstoqueMinimo] = useState<string>('');

  const carregarProdutos = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .order('nome', { ascending: true });

      if (error) throw error;
      if (data) setProdutos(data);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setErro(errorObj?.message || 'Erro ao carregar produtos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarProdutos();
  }, [carregarProdutos]);

  const handleAdicionarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) {
      alert('Insira o nome do item.');
      return;
    }

    try {
      setSalvandoNovo(true);
      
      const dadosParaEnviar = {
        nome: novoNome.trim(),
        classificacao: novaClassificacao,
        preco_venda: parseFloat(novoPreco) || 0,
        estoque_atual: parseInt(novoEstoque) || 0,
        estoque_minimo: parseInt(novoEstoqueMinimo) || 0,
      };

      const { error } = await supabase.from('produtos').insert([dadosParaEnviar]);

      if (error) throw error;

      setNovoNome('');
      setNovaClassificacao('Produto Finalizado');
      setNovoPreco('0.00');
      setNovoEstoque('0');
      setNovoEstoqueMinimo('0');
      await carregarProdutos();
      alert('Produto adicionado com sucesso!');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao adicionar: ${errorObj.message}`);
    } finally {
      setSalvandoNovo(false);
    }
  };

  const iniciarEdicao = (prod: Produto) => {
    setEditandoId(prod.id);
    setEditNome(prod.nome);
    setEditClassificacao(prod.classificacao || 'Produto Finalizado');
    setEditPreco(String(prod.preco_venda ?? 0));
    setEditEstoque(String(prod.estoque_atual ?? 0));
    setEditEstoqueMinimo(String(prod.estoque_minimo ?? 0));
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
  };

  const salvarEdicao = async (id: string) => {
    try {
      const dadosAtualizados = {
        nome: editNome.trim(),
        classificacao: editClassificacao,
        preco_venda: parseFloat(editPreco) || 0,
        estoque_atual: parseInt(editEstoque) || 0,
        estoque_minimo: parseInt(editEstoqueMinimo) || 0,
      };

      const { error } = await supabase
        .from('produtos')
        .update(dadosAtualizados)
        .eq('id', id);

      if (error) throw error;

      setEditandoId(null);
      await carregarProdutos();
      alert('Produto atualizado com sucesso!');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao atualizar produto: ${errorObj.message}`);
    }
  };

  const handleExcluir = async (id: string, nome: string) => {
    if (!window.confirm(`Tens a certeza que pretendes eliminar o produto "${nome}"?`)) return;

    try {
      const { error } = await supabase.from('produtos').delete().eq('id', id);
      if (error) throw error;

      setProdutos((prev) => prev.filter((p) => p.id !== id));
      alert('Produto eliminado com sucesso!');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao eliminar: ${errorObj.message}`);
    }
  };

  const produtosFiltrados = produtos.filter((p) =>
    p.nome.toLowerCase().includes(filtroBusca.toLowerCase().trim())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Produtos e Estoque</h1>
            <p className="text-sm text-slate-400">Controle de catálogo, preços e limites mínimos de estoque - OrC Brasil</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            ← Painel Principal
          </Link>
        </div>

        {/* Formulário Adicionar Novo Produto */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <h2 className="text-lg font-semibold text-slate-200">Adicionar Novo Produto / Item</h2>
          <form onSubmit={handleAdicionarProduto} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Nome do Item</label>
              <input
                type="text"
                placeholder="Ex: YERBA 50g"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Classificação</label>
              <select
                value={novaClassificacao}
                onChange={(e) => setNovaClassificacao(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                {OPCOES_CLASSIFICACAO.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Preço Venda (R$)</label>
              <input
                type="number"
                step="0.01"
                value={novoPreco}
                onChange={(e) => setNovoPreco(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Estoque Atual</label>
              <input
                type="number"
                value={novoEstoque}
                onChange={(e) => setNovoEstoque(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Estoque Mínimo</label>
              <input
                type="number"
                value={novoEstoqueMinimo}
                onChange={(e) => setNovoEstoqueMinimo(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-6 flex justify-end">
              <button
                type="submit"
                disabled={salvandoNovo}
                className="px-5 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {salvandoNovo ? 'A adicionar...' : '+ Adicionar Produto'}
              </button>
            </div>
          </form>
        </div>

        {/* Catálogo Atual e Filtro */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-200">
              Catálogo Atual ({produtos.length} itens)
            </h2>
            <input
              type="text"
              placeholder="Filtrar por nome..."
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
            />
          </div>

          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-950/50 rounded-lg border border-slate-800">
              Carregando catálogo...
            </div>
          ) : erro ? (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-center text-sm">
              {erro}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Nome do Item</th>
                    <th className="p-3.5">Classificação</th>
                    <th className="p-3.5">Preço (R$)</th>
                    <th className="p-3.5 text-center">Estoque Atual</th>
                    <th className="p-3.5 text-center">Estoque Mínimo</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-slate-500 font-medium">
                        Nenhum produto encontrado.
                      </td>
                    </tr>
                  ) : (
                    produtosFiltrados.map((prod) => {
                      const estaEditando = editandoId === prod.id;
                      const atual = prod.estoque_atual ?? 0;
                      const minimo = prod.estoque_minimo ?? 0;

                      // Lógica de alerta visual para o estoquista
                      let badgeEstoqueClass = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40';
                      let statusTexto = `${atual} un`;

                      if (atual <= 0) {
                        badgeEstoqueClass = 'bg-red-950/65 text-red-400 border-red-800/40 animate-pulse';
                        statusTexto = `${atual} un (Zerado)`;
                      } else if (atual <= minimo) {
                        badgeEstoqueClass = 'bg-amber-950/65 text-amber-400 border-amber-800/40';
                        statusTexto = `${atual} un (Baixo)`;
                      }

                      return (
                        <tr key={prod.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Nome */}
                          <td className="p-3.5 font-semibold text-slate-100">
                            {estaEditando ? (
                              <input
                                type="text"
                                value={editNome}
                                onChange={(e) => setEditNome(e.target.value)}
                                className="w-full p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none"
                              />
                            ) : (
                              prod.nome
                            )}
                          </td>

                          {/* Classificação */}
                          <td className="p-3.5">
                            {estaEditando ? (
                              <select
                                value={editClassificacao}
                                onChange={(e) => setEditClassificacao(e.target.value)}
                                className="w-full p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none"
                              >
                                {OPCOES_CLASSIFICACAO.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="px-2.5 py-1 rounded border text-xs font-semibold bg-slate-800 border-slate-700 text-slate-300">
                                {prod.classificacao || 'Produto Finalizado'}
                              </span>
                            )}
                          </td>

                          {/* Preço */}
                          <td className="p-3.5 text-slate-300">
                            {estaEditando ? (
                              <input
                                type="number"
                                step="0.01"
                                value={editPreco}
                                onChange={(e) => setEditPreco(e.target.value)}
                                className="w-24 p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none"
                              />
                            ) : (
                              `R$ ${(Number(prod.preco_venda) || 0).toFixed(2)}`
                            )}
                          </td>

                          {/* Estoque Atual com Alerta Visual */}
                          <td className="p-3.5 text-center">
                            {estaEditando ? (
                              <input
                                type="number"
                                value={editEstoque}
                                onChange={(e) => setEditEstoque(e.target.value)}
                                className="w-20 p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none text-center mx-auto block"
                              />
                            ) : (
                              <span className={`inline-block px-2.5 py-1 rounded-md border text-xs font-bold ${badgeEstoqueClass}`}>
                                {statusTexto}
                              </span>
                            )}
                          </td>

                          {/* Estoque Mínimo */}
                          <td className="p-3.5 text-center text-slate-300">
                            {estaEditando ? (
                              <input
                                type="number"
                                value={editEstoqueMinimo}
                                onChange={(e) => setEditEstoqueMinimo(e.target.value)}
                                className="w-20 p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none text-center mx-auto block"
                              />
                            ) : (
                              `${prod.estoque_minimo ?? 0} un`
                            )}
                          </td>

                          {/* Ações */}
                          <td className="p-3.5 text-center whitespace-nowrap space-x-2">
                            {estaEditando ? (
                              <>
                                <button
                                  onClick={() => salvarEdicao(prod.id)}
                                  className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={cancelarEdicao}
                                  className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => iniciarEdicao(prod)}
                                  className="px-2.5 py-1.5 bg-blue-950/60 hover:bg-blue-900/80 text-blue-400 hover:text-blue-300 border border-blue-800/50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleExcluir(prod.id, prod.nome)}
                                  className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-800/50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Excluir
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}