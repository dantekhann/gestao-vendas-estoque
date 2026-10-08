'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

// Esquema de validação com Zod
const produtoSchema = z.object({
  nome: z.string().min(2, 'O nome do item deve ter pelo menos 2 caracteres.'),
  classificacao: z.string().min(1, 'Selecione uma classificação válida.'),
  preco_venda: z.number().nonnegative('O preço de venda não pode ser negativo.'),
  estoque_atual: z.number().int('O estoque atual deve ser um número inteiro.').nonnegative('O estoque não pode ser negativo.'),
  estoque_minimo: z.number().int('O estoque mínimo deve ser um número inteiro.').nonnegative('O estoque mínimo não pode ser negativo.'),
  ativo: z.boolean().optional(),
});

interface Produto {
  id: string;
  nome: string;
  classificacao?: string;
  preco_venda: number;
  estoque_atual: number;
  estoque_minimo?: number;
  ativo?: boolean;
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
  const [filtroStatus, setFiltroStatus] = useState<string>('ativos');
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('todas');
  const [filtroAlertaEstoque, setFiltroAlertaEstoque] = useState<boolean>(false);
  const [painelReposicaoAberto, setPainelReposicaoAberto] = useState<boolean>(false);

  // Estados para Adicionar Novo Produto[cite: 2]
  const [novoNome, setNovoNome] = useState<string>('');
  const [novaClassificacao, setNovaClassificacao] = useState<string>('Produto Finalizado');
  const [novoPreco, setNovoPreco] = useState<string>('0.00');
  const [novoEstoque, setNovoEstoque] = useState<string>('0');
  const [novoEstoqueMinimo, setNovoEstoqueMinimo] = useState<string>('0');
  const [salvandoNovo, setSalvandoNovo] = useState<boolean>(false);

  // Estados para Edição Inline[cite: 2]
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
        .order('nome', { ascending: true })
        .range(0, 999);

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
    let isMounted = true;

    async function init() {
      if (isMounted) {
        await carregarProdutos();
      }
    }
    init();

    return () => {
      isMounted = false;
    };
  }, [carregarProdutos]);

  const handleAdicionarProduto = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação com Zod em tempo de execução[cite: 2]
    const resultadoValidacao = produtoSchema.safeParse({
      nome: novoNome.trim(),
      classificacao: novaClassificacao,
      preco_venda: parseFloat(novoPreco),
      estoque_atual: parseInt(novoEstoque, 10),
      estoque_minimo: parseInt(novoEstoqueMinimo, 10),
      ativo: true,
    });

    if (!resultadoValidacao.success) {
      const errosFormatados = resultadoValidacao.error.flatten();
      const primeiraMensagem = Object.values(errosFormatados.fieldErrors)[0]?.[0] || 'Dados inválidos.';
      alert(`Erro de validação: ${primeiraMensagem}`);
      return;
    }

    try {
      setSalvandoNovo(true);
      
      const { error } = await supabase.from('produtos').insert([resultadoValidacao.data]);

      if (error) throw error;

      setNovoNome('');
      setNovaClassificacao('Produto Finalizado');
      setNovoPreco('0.00');
      setNovoEstoque('0');
      setNovoEstoqueMinimo('0');
      await carregarProdutos();
      alert('Produto adicionado e validado com sucesso!');
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
    // Validação da edição com Zod[cite: 2]
    const resultadoValidacao = produtoSchema.safeParse({
      nome: editNome.trim(),
      classificacao: editClassificacao,
      preco_venda: parseFloat(editPreco),
      estoque_atual: parseInt(editEstoque, 10),
      estoque_minimo: parseInt(editEstoqueMinimo, 10),
    });

    if (!resultadoValidacao.success) {
      const errosFormatados = resultadoValidacao.error.flatten();
      const primeiraMensagem = Object.values(errosFormatados.fieldErrors)[0]?.[0] || 'Dados inválidos.';
      alert(`Erro de validação: ${primeiraMensagem}`);
      return;
    }

    try {
      const { error } = await supabase
        .from('produtos')
        .update(resultadoValidacao.data)
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

  const handleAlternarStatus = async (prod: Produto) => {
    const novoStatus = prod.ativo === false ? true : false;
    const acaoStr = novoStatus ? 'reativar' : 'ocultar';

    if (!window.confirm(`Tens a certeza que pretendes ${acaoStr} o produto "${prod.nome}"?`)) return;

    try {
      const { error } = await supabase
        .from('produtos')
        .update({ ativo: novoStatus })
        .eq('id', prod.id);

      if (error) throw error;

      setProdutos((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, ativo: novoStatus } : p))
      );
      alert(`Produto ${novoStatus ? 'reativado' : 'ocultado'} com sucesso!`);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao alterar status: ${errorObj.message}`);
    }
  };

  const excluirProduto = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza absoluta que deseja EXCLUIR PERMANENTEMENTE o produto "${nome}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('produtos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setProdutos((prev) => prev.filter((p) => p.id !== id));
      alert('Produto excluído com sucesso!');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao excluir produto: ${errorObj.message || 'Erro desconhecido'}`);
    }
  };

  const produtosEmAlertaLista = produtos.filter((p) => {
    const atual = p.estoque_atual ?? 0;
    const minimo = p.estoque_minimo ?? 0;
    return atual <= minimo && (p.ativo !== false);
  });

  const totalEmAlerta = produtosEmAlertaLista.length;

  const copiarListaReposicao = () => {
    const texto = produtosEmAlertaLista.map((p) => {
      const atual = p.estoque_atual ?? 0;
      const minimo = p.estoque_minimo ?? 0;
      const qtdSugerida = Math.max(1, (minimo > 0 ? minimo * 2 : 10) - atual);
      return `- ${p.nome}: Atual: ${atual} | Mín: ${minimo} | Sugestão: +${qtdSugerida} un`;
    }).join('\n');

    const cabecalho = `📋 *LISTA DE REPOSIÇÃO DE ESTOQUE - OrC Brasil*\n\n${texto}\n\nGerado automaticamente pelo sistema.`;
    navigator.clipboard.writeText(cabecalho);
    alert('Lista de reposição copiada para a área de transferência!');
  };

  const produtosFiltrados = produtos.filter((p) => {
    const bateBusca = p.nome.toLowerCase().includes(filtroBusca.toLowerCase().trim());
    const isAtivo = p.ativo !== false;

    let passaStatus = true;
    if (filtroStatus === 'ativos') passaStatus = isAtivo;
    if (filtroStatus === 'inativos') passaStatus = !isAtivo;

    let passaClassificacao = true;
    if (filtroClassificacao !== 'todas') {
      passaClassificacao = (p.classificacao || 'Produto Finalizado') === filtroClassificacao;
    }

    let passaAlerta = true;
    if (filtroAlertaEstoque) {
      const atual = p.estoque_atual ?? 0;
      const minimo = p.estoque_minimo ?? 0;
      passaAlerta = atual <= minimo;
    }

    return bateBusca && passaStatus && passaClassificacao && passaAlerta;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho[cite: 2] */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Produtos e Estoque</h1>
            <p className="text-sm text-slate-400">Controle rigoroso validado por Zod - OrC Brasil</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/inventario/whatsapp"
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 rounded-lg shadow-sm transition-colors"
            >
              📱 Inventário WhatsApp
            </Link>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              ← Painel Principal
            </Link>
          </div>
        </div>

        {/* PAINEL DE REPOSIÇÃO AUTOMÁTICA POR LOTE */}
        {totalEmAlerta > 0 && (
          <div className="bg-amber-950/30 border border-amber-600/40 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <div>
                  <h2 className="text-base font-bold text-amber-200">Painel de Reposição Automática por Lote</h2>
                  <p className="text-xs text-amber-300/80">{totalEmAlerta} {totalEmAlerta === 1 ? 'item precisa' : 'itens precisam'} de atenção urgente para reposição.</p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPainelReposicaoAberto(!painelReposicaoAberto)}
                  className="px-3.5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg transition-colors cursor-pointer shadow"
                >
                  {painelReposicaoAberto ? 'Ocultar Detalhes' : 'Ver Sugestão de Compra'}
                </button>
                <button
                  type="button"
                  onClick={copiarListaReposicao}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-600/50 rounded-lg transition-colors cursor-pointer"
                >
                  📋 Copiar Lista WhatsApp
                </button>
              </div>
            </div>

            {painelReposicaoAberto && (
              <div className="bg-slate-900/90 rounded-lg p-4 border border-amber-800/50 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {produtosEmAlertaLista.map((p) => {
                    const atual = p.estoque_atual ?? 0;
                    const minimo = p.estoque_minimo ?? 0;
                    const qtdSugerida = Math.max(1, (minimo > 0 ? minimo * 2 : 10) - atual);

                    return (
                      <div key={p.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col justify-between gap-2">
                        <div>
                          <span className="font-bold text-sm text-slate-100 block">{p.nome}</span>
                          <span className="text-xs text-slate-400">Classificação: {p.classificacao || 'Produto Finalizado'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                          <span className="text-red-400 font-medium">Atual: {atual} | Mín: {minimo}</span>
                          <span className="bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-500/30">
                            Sugestão: +{qtdSugerida} un
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Formulário Adicionar Novo Produto[cite: 2] */}
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
                {salvandoNovo ? 'A validar e adicionar...' : '+ Adicionar Produto'}
              </button>
            </div>
          </form>
        </div>

        {/* Catálogo Atual e Filtros[cite: 2] */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-200">
                Catálogo Atual ({produtosFiltrados.length} / {produtos.length} itens)
              </h2>
              {totalEmAlerta > 0 && (
                <button
                  type="button"
                  onClick={() => setFiltroAlertaEstoque(!filtroAlertaEstoque)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                    filtroAlertaEstoque 
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md ring-2 ring-amber-500/40' 
                      : 'bg-amber-950/70 text-amber-400 border-amber-700/60 hover:bg-amber-900/80 animate-pulse'
                  }`}
                >
                  ⚠️ {totalEmAlerta} {totalEmAlerta === 1 ? 'item em alerta' : 'itens em alerta'}
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <select
                value={filtroClassificacao}
                onChange={(e) => setFiltroClassificacao(e.target.value)}
                className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todas">Todas as Classificações</option>
                {OPCOES_CLASSIFICACAO.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ativos">Apenas Ativos</option>
                <option value="inativos">Apenas Ocultos</option>
                <option value="todos">Todos os Status</option>
              </select>

              <input
                type="text"
                placeholder="Filtrar por nome..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-52"
              />
            </div>
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
                    <th className="p-3.5 text-center">Estoque Atual / Mínimo</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-slate-500 font-medium">
                        Nenhum produto encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    produtosFiltrados.map((prod) => {
                      const estaEditando = editandoId === prod.id;
                      const atual = prod.estoque_atual ?? 0;
                      const minimo = prod.estoque_minimo ?? 0;
                      const ativo = prod.ativo !== false;

                      let badgeEstoqueClass = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40';
                      let statusTexto = `${atual} un`;

                      if (atual <= 0) {
                        badgeEstoqueClass = 'bg-red-950/80 text-red-300 border-red-700/60 shadow-sm animate-pulse';
                        statusTexto = `🚨 ${atual} un (Zerado)`;
                      } else if (atual <= minimo) {
                        badgeEstoqueClass = 'bg-amber-950/80 text-amber-300 border-amber-700/60 shadow-sm';
                        statusTexto = `⚠️ ${atual} un (Mín: ${minimo})`;
                      }

                      return (
                        <tr key={prod.id} className={`hover:bg-slate-800/40 transition-colors ${!ativo ? 'opacity-50' : ''}`}>
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

                          <td className="p-3.5 text-center">
                            {estaEditando ? (
                              <div className="flex items-center justify-center gap-2">
                                <input
                                  type="number"
                                  placeholder="Atual"
                                  value={editEstoque}
                                  onChange={(e) => setEditEstoque(e.target.value)}
                                  className="w-20 p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none text-center"
                                />
                                <span className="text-xs text-slate-400">Mín:</span>
                                <input
                                  type="number"
                                  placeholder="Mín."
                                  value={editEstoqueMinimo}
                                  onChange={(e) => setEditEstoqueMinimo(e.target.value)}
                                  className="w-16 p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none text-center"
                                />
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-block px-2.5 py-1 rounded-md border text-xs font-bold ${badgeEstoqueClass}`}>
                                  {statusTexto}
                                </span>
                                {minimo > 0 && atual > minimo && (
                                  <span className="text-[10px] text-slate-400">Estoque mínimo: {minimo}</span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="p-3.5 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${ativo ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                              {ativo ? 'Ativo' : 'Oculto'}
                            </span>
                          </td>

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
                                  onClick={() => handleAlternarStatus(prod)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${ativo ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 border-amber-800/50' : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-800/50'}`}
                                >
                                  {ativo ? 'Ocultar' : 'Reativar'}
                                </button>
                                <button
                                  onClick={() => excluirProduto(prod.id, prod.nome)}
                                  className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-400 hover:text-rose-300 border border-rose-800/50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
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