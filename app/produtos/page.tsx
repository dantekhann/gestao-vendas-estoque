'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Produto {
  id: string;
  nome: string;
  categoria?: string | null;
  tipo?: string | null;
  preco_venda: number;
  estoque_atual: number;
}

// Função inteligente de rótulos (mesma usada no resto do sistema)
function formatarRotulo(cat: string | null | undefined, tipo: string | null | undefined, nomeProduto: string = '') {
  const valor = (tipo || cat || '').toUpperCase().trim();
  const nome = nomeProduto.toUpperCase().trim();

  if (
    nome.includes('LUVA') || 
    nome.includes('MÁSCARA') || 
    nome.includes('PROPÉ') || 
    nome.includes('TOUCA') ||
    valor.includes('EPI')
  ) {
    return 'EPI';
  }

  if (valor.includes('MATERIA') || valor.includes('INSUMO')) return 'INSUMO';
  if (valor.includes('CONSUMO') || valor.includes('ALMOXARIFADO')) return 'ALMOXARIFADO';
  if (valor.includes('EMBALAGEM')) return 'EMBALAGEM';
  if (valor.includes('ACABADO') || valor.includes('PRODUTO')) return 'PRODUTO FINALIZADO';
  
  if (!valor) return 'SEM CATEGORIA';
  return valor.replace(/_/g, ' ');
}

function obterEstiloRotulo(rotulo: string) {
  switch (rotulo) {
    case 'EPI':
      return 'bg-emerald-950/65 text-emerald-400 border-emerald-800/40';
    case 'INSUMO':
      return 'bg-blue-950/65 text-blue-400 border-blue-800/40';
    case 'ALMOXARIFADO':
      return 'bg-purple-950/65 text-purple-400 border-purple-800/40';
    case 'EMBALAGEM':
      return 'bg-amber-950/65 text-amber-400 border-amber-800/40';
    case 'PRODUTO FINALIZADO':
      return 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/40';
    default:
      return 'bg-slate-800 text-slate-400 border-slate-700';
  }
}

export default function GestaoProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState<string>('');

  // Estados do formulário de Novo Produto
  const [novoNome, setNovoNome] = useState<string>('');
  const [novaCategoria, setNovaCategoria] = useState<string>('PRODUTO FINALIZADO');
  const [novoPreco, setNovoPreco] = useState<string>('0.00');
  const [novoEstoque, setNovoEstoque] = useState<string>('0');
  const [salvando, setSalvando] = useState<boolean>(false);

  // Estado para edição inline de categoria
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [categoriaTemp, setCategoriaTemp] = useState<string>('');

  async function carregarProdutos() {
    try {
      setCarregando(true);
      setErro(null);
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .order('nome', { ascending: true });

      if (error) throw error;
      if (data) setProdutos(data);
    } catch (err: any) {
      setErro(err?.message || 'Erro ao carregar produtos.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  const handleCriarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) {
      alert('Insira o nome do produto.');
      return;
    }

    try {
      setSalvando(true);
      const { error } = await supabase.from('produtos').insert([
        {
          nome: novoNome.trim(),
          categoria: novaCategoria,
          tipo: novaCategoria,
          preco_venda: parseFloat(novoPreco) || 0,
          estoque_atual: parseInt(novoEstoque, 10) || 0,
        },
      ]);

      if (error) throw error;

      alert('Produto criado com sucesso!');
      setNovoNome('');
      setNovoPreco('0.00');
      setNovoEstoque('0');
      carregarProdutos();
    } catch (err: any) {
      alert(`Erro ao criar produto: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleAtualizarCategoria = async (id: string) => {
    try {
      const { error } = await supabase
        .from('produtos')
        .update({ categoria: categoriaTemp, tipo: categoriaTemp })
        .eq('id', id);

      if (error) throw error;

      setEditandoId(null);
      carregarProdutos();
    } catch (err: any) {
      alert(`Erro ao atualizar categoria: ${err.message}`);
    }
  };

  const handleExcluirProduto = async (id: string, nome: string) => {
    const confirmar = window.confirm(
      `Tens a certeza que pretendes excluir o produto "${nome}"? Esta ação removerá o registo permanentemente.`
    );
    if (!confirmar) return;

    try {
      const { error } = await supabase.from('produtos').delete().eq('id', id);
      if (error) throw error;

      setProdutos((prev) => prev.filter((p) => p.id !== id));
      alert('Produto excluído com sucesso!');
    } catch (err: any) {
      alert(`Erro ao excluir produto (pode estar associado a vendas ou movimentações anteriores): ${err.message}`);
    }
  };

  const produtosFiltrados = produtos.filter((p) =>
    p.nome.toLowerCase().includes(busca.toLowerCase().trim())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Gestão de Produtos</h1>
            <p className="text-sm text-slate-400 mt-1">Adicione, edite categorias ou remova itens do catálogo - OrC Brasil</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700"
          >
            ← Painel Principal
          </Link>
        </div>

        {/* Formulário para Adicionar Novo Produto */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h2 className="text-lg font-semibold text-white">Adicionar Novo Produto / Item</h2>
          
          <form onSubmit={handleCriarProduto} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">Nome do Item</label>
              <input
                type="text"
                placeholder="Ex: YERBA 50g"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Classificação</label>
              <select
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="PRODUTO FINALIZADO">Produto Finalizado</option>
                <option value="INSUMO">Insumo (Matéria-Prima)</option>
                <option value="ALMOXARIFADO">Almoxarifado (Consumo)</option>
                <option value="EMBALAGEM">Embalagem</option>
                <option value="EPI">EPI</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Preço Venda (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={novoPreco}
                onChange={(e) => setNovoPreco(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Stock</label>
              <input
                type="number"
                min="0"
                value={novoEstoque}
                onChange={(e) => setNovoEstoque(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-center"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={salvando}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors text-sm shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {salvando ? 'A criar...' : '+ Adicionar'}
              </button>
            </div>
          </form>
        </div>

        {/* Lista de Produtos Cadastrados */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg font-semibold text-white">Catálogo Atual ({produtos.length} itens)</h2>
            <div className="w-full sm:w-72">
              <input
                type="text"
                placeholder="Pesquisar produto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {carregando ? (
            <div className="p-8 text-center text-slate-500 animate-pulse">A carregar catálogo...</div>
          ) : erro ? (
            <div className="p-4 bg-red-950/50 border border-red-800 text-red-400 rounded-xl text-sm">{erro}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Nome do Item</th>
                    <th className="p-3.5">Classificação Atual</th>
                    <th className="p-3.5 text-right">Preço (R$)</th>
                    <th className="p-3.5 text-center">Stock Atual</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {produtosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        Nenhum produto encontrado.
                      </td>
                    </tr>
                  ) : (
                    produtosFiltrados.map((p) => {
                      const rotulo = formatarRotulo(p.categoria, p.tipo, p.nome);
                      const estilo = obterEstiloRotulo(rotulo);
                      const estaEditando = editandoId === p.id;

                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 font-semibold text-slate-100">{p.nome}</td>
                          <td className="p-3.5">
                            {estaEditando ? (
                              <div className="flex items-center gap-2">
                                <select
                                  value={categoriaTemp}
                                  onChange={(e) => setCategoriaTemp(e.target.value)}
                                  className="p-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-100 outline-none"
                                >
                                  <option value="PRODUTO FINALIZADO">Produto Finalizado</option>
                                  <option value="INSUMO">Insumo</option>
                                  <option value="ALMOXARIFADO">Almoxarifado</option>
                                  <option value="EMBALAGEM">Embalagem</option>
                                  <option value="EPI">EPI</option>
                                </select>
                                <button
                                  onClick={() => handleAtualizarCategoria(p.id)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer"
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => setEditandoId(null)}
                                  className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <span className={`px-3 py-1 border rounded-lg text-xs font-bold uppercase tracking-wide ${estilo}`}>
                                {rotulo}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right font-medium text-slate-300">
                            R$ {(p.preco_venda || 0).toFixed(2)}
                          </td>
                          <td className="p-3.5 text-center font-bold text-emerald-400">
                            {p.estoque_atual} un
                          </td>
                          <td className="p-3.5 text-center space-x-2">
                            {!estaEditando && (
                              <button
                                onClick={() => {
                                  setEditandoId(p.id);
                                  setCategoriaTemp(p.categoria || 'PRODUTO FINALIZADO');
                                }}
                                className="px-2.5 py-1.5 bg-blue-950/50 hover:bg-blue-900/60 text-blue-400 border border-blue-800/50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                Editar Categoria
                              </button>
                            )}
                            <button
                              onClick={() => handleExcluirProduto(p.id, p.nome)}
                              className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-800/50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Excluir
                            </button>
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