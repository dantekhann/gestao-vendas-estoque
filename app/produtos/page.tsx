'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { formatarData } from '@/lib/formatters';
import { processarLancamentoVelcro, ehVelcro, encontrarParceiroVelcro } from '@/lib/estoque';

// Esquema de validação com Zod
const produtoSchema = z.object({
  nome: z.string().min(2, 'O nome do item deve ter pelo menos 2 caracteres.'),
  classificacao: z.string().min(1, 'Selecione uma classificação válida.'),
  preco_venda: z.number().nonnegative('O preço de venda não pode ser negativo.'),
  estoque_atual: z.number().int('O estoque atual deve ser um número inteiro.').nonnegative('O estoque não pode ser negativo.'),
  estoque_minimo: z.number().int('O estoque mínimo deve ser um número inteiro.').nonnegative('O estoque mínimo não pode ser negativo.'),
  prazo_entrega_min: z.number().int('O prazo mínimo deve ser inteiro.').nonnegative().default(0),
  prazo_entrega_max: z.number().int('O prazo máximo deve ser inteiro.').nonnegative().default(0),
  ativo: z.boolean().optional(),
});

interface Produto {
  id: string;
  nome: string;
  classificacao?: string;
  preco_venda: number;
  estoque_atual: number;
  estoque_minimo?: number;
  prazo_entrega_min?: number;
  prazo_entrega_max?: number;
  ativo?: boolean;
}

interface EntregaParcial {
  id: string;
  pedido_id: string;
  quantidade_entregue: number;
  data_recebimento: string;
  observacao?: string;
}

interface Pedido {
  id: string;
  produto_id: string;
  quantidade_total: number;
  quantidade_recebida: number;
  data_pedido: string;
  previsao_entrega?: string;
  status: string;
  observacao?: string;
  produtos?: Produto | Produto[] | null;
  entregas_parciais?: EntregaParcial[];
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
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [, setErro] = useState<string | null>(null);
  
  const [filtroBusca, setFiltroBusca] = useState<string>('');
  const [filtroStatus, setFiltroStatus] = useState<string>('ativos');
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('todas');
  const [filtroAlertaEstoque] = useState<boolean>(false);
  
  const [painelReposicaoAberto, setPainelReposicaoAberto] = useState<boolean>(false);
  const [secaoTransitoAberta, setSecaoTransitoAberta] = useState<boolean>(true);

  // Estados para Adicionar Novo Produto
  const [novoNome, setNovoNome] = useState<string>('');
  const [novaClassificacao, setNovaClassificacao] = useState<string>('Insumo (Matéria-Prima)');
  const [novoPreco, setNovoPreco] = useState<string>('0.00');
  const [novoEstoque, setNovoEstoque] = useState<string>('0');
  const [novoEstoqueMinimo, setNovoEstoqueMinimo] = useState<string>('0');
  const [novoPrazoMin, setNovoPrazoMin] = useState<string>('5');
  const [novoPrazoMax, setNovoPrazoMax] = useState<string>('7');
  const [salvandoNovo, setSalvandoNovo] = useState<boolean>(false);

  // Estados para Registo de Pedido (Autocomplete)
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<string>('');
  const [textoBuscaProduto, setTextoBuscaProduto] = useState<string>('');
  const [mostrarDropdownBusca, setMostrarDropdownBusca] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [qtdPedido, setQtdPedido] = useState<string>('100');
  const [dataPedidoInput, setDataPedidoInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [previsaoInput, setPrevisaoInput] = useState<string>('09/10/2026 até 12/10/2026');
  const [salvandoPedido, setSalvandoPedido] = useState<boolean>(false);

  // Estados para Expansão e Recebimento Parcial
  const [pedidosExpandidos, setPedidosExpandidos] = useState<Record<string, boolean>>({});
  const [modalRecebimentoAberto, setModalRecebimentoAberto] = useState<boolean>(false);
  const [pedidoSelecionadoRecebimento, setPedidoSelecionadoRecebimento] = useState<Pedido | null>(null);
  const [quantidadeParcialReceber, setQuantidadeParcialReceber] = useState<string>('');
  const [dataRecebimentoParcial, setDataRecebimentoParcial] = useState<string>(new Date().toISOString().split('T')[0]);
  const [obsRecebimentoParcial, setObsRecebimentoParcial] = useState<string>('');

  // Estado do Modal de Histórico
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState<boolean>(false);
  const [historicoExpandidos, setHistoricoExpandidos] = useState<Record<string, boolean>>({});

  // Estados para Edição Inline
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState<string>('');
  const [editClassificacao, setEditClassificacao] = useState<string>('');
  const [editPreco, setEditPreco] = useState<string>('');
  const [editEstoque, setEditEstoque] = useState<string>('');
  const [editEstoqueMinimo, setEditEstoqueMinimo] = useState<string>('');
  const [editPrazoMin, setEditPrazoMin] = useState<string>('');
  const [editPrazoMax, setEditPrazoMax] = useState<string>('');

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const [resProdutos, resPedidos] = await Promise.all([
        supabase.from('produtos').select('*').order('nome', { ascending: true }).range(0, 999),
        supabase.from('pedidos').select('*, produtos (id, nome, estoque_atual), entregas_parciais (*)').order('data_pedido', { ascending: false })
      ]);

      if (resProdutos.error) throw resProdutos.error;
      if (resProdutos.data) setProdutos(resProdutos.data);

      if (resPedidos.error) {
        console.warn('Aviso pedidos:', resPedidos.error.message);
      } else if (resPedidos.data) {
        setPedidos(resPedidos.data);
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setErro(errorObj?.message || 'Erro ao carregar dados.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      if (isMounted) await carregarDados();
    }
    init();
    return () => { isMounted = false; };
  }, [carregarDados]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMostrarDropdownBusca(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selecionarProdutoAutocomplete = (prod: Produto) => {
    setProdutoSelecionadoId(prod.id);
    setTextoBuscaProduto(prod.nome);
    setMostrarDropdownBusca(false);
  };

  const produtosFiltradosAutocomplete = produtos.filter(p => 
    p.nome.toLowerCase().includes(textoBuscaProduto.toLowerCase().trim())
  );

  const toggleExpandirPedido = (pedidoId: string) => {
    setPedidosExpandidos((prev) => ({ ...prev, [pedidoId]: !prev[pedidoId] }));
  };

  const toggleExpandirHistorico = (pedidoId: string) => {
    setHistoricoExpandidos((prev) => ({ ...prev, [pedidoId]: !prev[pedidoId] }));
  };

  const handleAdicionarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    const resultadoValidacao = produtoSchema.safeParse({
      nome: novoNome.trim(),
      classificacao: novaClassificacao,
      preco_venda: parseFloat(novoPreco),
      estoque_atual: parseInt(novoEstoque, 10),
      estoque_minimo: parseInt(novoEstoqueMinimo, 10),
      prazo_entrega_min: parseInt(novoPrazoMin, 10),
      prazo_entrega_max: parseInt(novoPrazoMax, 10),
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
      setNovaClassificacao('Insumo (Matéria-Prima)');
      setNovoPreco('0.00');
      setNovoEstoque('0');
      setNovoEstoqueMinimo('0');
      await carregarDados();
      alert('Produto adicionado com sucesso!');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao adicionar: ${errorObj.message}`);
    } finally {
      setSalvandoNovo(false);
    }
  };

  const handleRegistarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!produtoSelecionadoId) {
      alert('Selecione um produto válido da lista clicando na sugestão.');
      return;
    }

    try {
      setSalvandoPedido(true);
      const { error } = await supabase.from('pedidos').insert([{
        produto_id: produtoSelecionadoId,
        quantidade_total: parseFloat(qtdPedido) || 1,
        quantidade_recebida: 0,
        data_pedido: dataPedidoInput,
        previsao_entrega: previsaoInput || null,
        status: 'Em Trânsito'
      }]);

      if (error) throw error;

      alert('Pedido em trânsito registado com sucesso!');
      setQtdPedido('100');
      setTextoBuscaProduto('');
      setProdutoSelecionadoId('');
      await carregarDados();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao registar pedido: ${errorObj.message}`);
    } finally {
      setSalvandoPedido(false);
    }
  };

  // A função do banco (registrar_recebimento_parcial) já dá entrada no produto do pedido.
  // Aqui só sincronizamos o produto parceiro do velcro (pacote <-> pares),
  // sem movimentar o produto do pedido de novo.
  // Retorna null se deu tudo certo (ou se não se aplica) e a mensagem de erro se falhou.
  const sincronizarVelcroAposRecebimento = async (
    pedido: Pedido,
    quantidade: number,
    observacao: string
  ): Promise<string | null> => {
    const prodPedido = Array.isArray(pedido.produtos) ? pedido.produtos[0] : pedido.produtos;
    if (!prodPedido || !ehVelcro(prodPedido.nome)) return null;

    const { parceiro, unidadeOrigem } = encontrarParceiroVelcro(prodPedido, produtos);
    if (!parceiro) return null;

    try {
      await processarLancamentoVelcro({
        produtoIdOrigem: prodPedido.id,
        produtoIdParceiro: parceiro.id,
        quantidade,
        unidadeOrigem,
        tipo: 'ENTRADA',
        observacao,
        registrarOrigem: false,
      });
      return null;
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      return errorObj?.message || 'erro desconhecido';
    }
  };

  const avisoFalhaVelcro = (detalhe: string) =>
    `Recebimento registado, mas o ajuste automático do velcro parceiro falhou (${detalhe}). ` +
    'NÃO repita o recebimento: corrija o produto parceiro em "Lançar Movimentação".';

  const handleConfirmarRecebimentoParcial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoSelecionadoRecebimento || !quantidadeParcialReceber) return;

    const qtdNum = parseFloat(quantidadeParcialReceber);
    if (isNaN(qtdNum) || qtdNum <= 0) {
      alert('Insira uma quantidade válida.');
      return;
    }

    try {
      const { error } = await supabase.rpc('registrar_recebimento_parcial', {
        p_pedido_id: pedidoSelecionadoRecebimento.id,
        p_quantidade: qtdNum,
        p_data_recebimento: dataRecebimentoParcial,
        p_observacao: obsRecebimentoParcial || 'Recebimento parcial de lote',
      });

      if (error) throw error;

      const erroVelcro = await sincronizarVelcroAposRecebimento(
        pedidoSelecionadoRecebimento,
        qtdNum,
        'Recebimento de pedido de velcro'
      );

      if (erroVelcro) {
        alert(avisoFalhaVelcro(erroVelcro));
      } else {
        alert('Recebimento parcial registado e stock atualizado com sucesso!');
      }
      setModalRecebimentoAberto(false);
      setPedidoSelecionadoRecebimento(null);
      setQuantidadeParcialReceber('');
      setObsRecebimentoParcial('');
      await carregarDados();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert('Erro ao registar recebimento: ' + (errorObj?.message || 'Erro desconhecido'));
    }
  };

  const handleReceberTotalDireto = async (pedido: Pedido) => {
    const saldoPendente = pedido.quantidade_total - (pedido.quantidade_recebida || 0);
    if (saldoPendente <= 0) return;

    const confirmar = window.confirm(`Confirmar o recebimento total do saldo pendente (${saldoPendente} unidades)?`);
    if (!confirmar) return;

    try {
      const { error } = await supabase.rpc('registrar_recebimento_parcial', {
        p_pedido_id: pedido.id,
        p_quantidade: saldoPendente,
        p_data_recebimento: new Date().toISOString().split('T')[0],
        p_observacao: 'Recebimento total direto',
      });

      if (error) throw error;

      const erroVelcro = await sincronizarVelcroAposRecebimento(
        pedido,
        saldoPendente,
        'Recebimento total direto de velcro'
      );

      if (erroVelcro) {
        alert(avisoFalhaVelcro(erroVelcro));
      } else {
        alert('Pedido marcado como totalmente recebido e stock atualizado!');
      }
      await carregarDados();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert('Erro: ' + (errorObj?.message || 'Erro desconhecido'));
    }
  };

  const handleCancelarPedido = async (pedidoId: string) => {
    const confirmar = window.confirm('Tem certeza que deseja cancelar este pedido?');
    if (!confirmar) return;

    try {
      const { error } = await supabase.from('pedidos').update({ status: 'Cancelado' }).eq('id', pedidoId);
      if (error) throw error;
      await carregarDados();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao cancelar pedido: ${errorObj.message}`);
    }
  };

  const alternarAtivo = async (id: string, ativoAtual?: boolean) => {
    const novoStatus = !(ativoAtual !== false);
    try {
      const { error } = await supabase
        .from('produtos')
        .update({ ativo: novoStatus })
        .eq('id', id);
      if (error) throw error;
      await carregarDados();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao atualizar estado do produto: ${errorObj.message}`);
    }
  };

  const iniciarEdicao = (prod: Produto) => {
    setEditandoId(prod.id);
    setEditNome(prod.nome);
    setEditClassificacao(prod.classificacao || 'Produto Finalizado');
    setEditPreco(String(prod.preco_venda ?? 0));
    setEditEstoque(String(prod.estoque_atual ?? 0));
    setEditEstoqueMinimo(String(prod.estoque_minimo ?? 0));
    setEditPrazoMin(String(prod.prazo_entrega_min ?? 0));
    setEditPrazoMax(String(prod.prazo_entrega_max ?? 0));
  };

  const cancelarEdicao = () => { setEditandoId(null); };

  const salvarEdicao = async (id: string) => {
    const resultadoValidacao = produtoSchema.safeParse({
      nome: editNome.trim(),
      classificacao: editClassificacao,
      preco_venda: parseFloat(editPreco),
      estoque_atual: parseInt(editEstoque, 10),
      estoque_minimo: parseInt(editEstoqueMinimo, 10),
      prazo_entrega_min: parseInt(editPrazoMin, 10),
      prazo_entrega_max: parseInt(editPrazoMax, 10),
    });

    if (!resultadoValidacao.success) {
      const errosFormatados = resultadoValidacao.error.flatten();
      const primeiraMensagem = Object.values(errosFormatados.fieldErrors)[0]?.[0] || 'Dados inválidos.';
      alert(`Erro de validação: ${primeiraMensagem}`);
      return;
    }

    try {
      const { error } = await supabase.from('produtos').update(resultadoValidacao.data).eq('id', id);
      if (error) throw error;
      setEditandoId(null);
      await carregarDados();
      alert('Produto atualizado com sucesso!');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao atualizar produto: ${errorObj.message}`);
    }
  };

  const excluirProduto = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza absoluta que deseja EXCLUIR PERMANENTEMENTE o produto "${nome}"?`)) return;

    try {
      const { error } = await supabase.from('produtos').delete().eq('id', id);
      if (error) throw error;
      setProdutos((prev) => prev.filter((p) => p.id !== id));
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      alert(`Erro ao excluir produto: ${errorObj.message}`);
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

  const pedidosAtivos = pedidos.filter(p => p.status !== 'Recebido' && p.status !== 'Cancelado');
  const pedidosHistorico = pedidos.filter(p => p.status === 'Recebido' || p.status === 'Cancelado');

  const produtosFiltrados = produtos.filter((p) => {
    const bateBusca = p.nome.toLowerCase().includes(filtroBusca.toLowerCase().trim());
    const isAtivo = p.ativo !== false;

    let passaStatus = true;
    if (filtroStatus === 'ativos') passaStatus = isAtivo;
    if (filtroStatus === 'inativos') passaStatus = !isAtivo;
    if (filtroStatus === 'todos') passaStatus = true;

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
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Produtos e Prazos</h1>
            <p className="text-sm text-slate-400">Controlo rigoroso e logístico - OrC Brasil</p>
          </div>
          <div className="flex gap-2">
            <Link href="/inventario/whatsapp" className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 rounded-lg shadow-sm transition-colors">
              📱 Inventário WhatsApp
            </Link>
            <Link href="/" className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700">
              ← Painel Principal
            </Link>
          </div>
        </div>

        {/* PAINEL DE REPOSIÇÃO */}
        {totalEmAlerta > 0 && (
          <div className="bg-amber-950/35 border border-amber-600/40 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <div>
                  <h2 className="text-base font-bold text-amber-200">Painel de Reposição Automática por Lote</h2>
                  <p className="text-xs text-amber-300/80">{totalEmAlerta} {totalEmAlerta === 1 ? 'item precisa' : 'itens precisam'} de atenção urgente.</p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button type="button" onClick={() => setPainelReposicaoAberto(!painelReposicaoAberto)} className="px-3.5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg transition-colors cursor-pointer shadow">
                  {painelReposicaoAberto ? 'Ocultar Detalhes' : 'Ver Sugestão de Compra'}
                </button>
                <button type="button" onClick={copiarListaReposicao} className="px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-600/50 rounded-lg transition-colors cursor-pointer">
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
                    const prazoStr = p.prazo_entrega_min === p.prazo_entrega_max ? `${p.prazo_entrega_min} dias úteis` : `${p.prazo_entrega_min}-${p.prazo_entrega_max} dias úteis`;

                    return (
                      <div key={p.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col justify-between gap-2">
                        <div>
                          <span className="font-bold text-sm text-slate-100 block">{p.nome}</span>
                          <span className="text-xs text-slate-400">Prazo de entrega: {prazoStr}</span>
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

        {/* SECÇÃO: LOGÍSTICA & PEDIDOS EM TRÂNSITO */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-200">📦 Logística & Pedidos Ativos</h2>
              <p className="text-xs text-slate-400">Controlo de encomendas em trânsito e parciais</p>
            </div>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setModalHistoricoAberto(true)} 
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                📜 Ver Histórico ({pedidosHistorico.length})
              </button>
              <button 
                type="button" 
                onClick={() => setSecaoTransitoAberta(!secaoTransitoAberta)} 
                className="px-3.5 py-2 text-xs font-semibold bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 rounded-lg transition-colors cursor-pointer"
              >
                {secaoTransitoAberta ? 'Ocultar Módulo' : 'Registar Pedido'}
              </button>
            </div>
          </div>

          {secaoTransitoAberta && (
            <div className="space-y-6 pt-3 border-t border-slate-800">
              
              <form onSubmit={handleRegistarPedido} className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">Registar Nova Compra / Encomenda</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="sm:col-span-2 relative" ref={dropdownRef}>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Pesquisar e Selecionar Insumo / Item</label>
                    <input 
                      type="text" 
                      placeholder="Comece a digitar o nome do produto..." 
                      value={textoBuscaProduto}
                      onChange={(e) => {
                        setTextoBuscaProduto(e.target.value);
                        setMostrarDropdownBusca(true);
                        if (!e.target.value) setProdutoSelecionadoId('');
                      }}
                      onFocus={() => setMostrarDropdownBusca(true)}
                      className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-900 text-slate-100 text-sm outline-none focus:border-blue-500"
                    />

                    {mostrarDropdownBusca && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {produtosFiltradosAutocomplete.length === 0 ? (
                          <div className="p-3 text-xs text-slate-400">Nenhum produto encontrado.</div>
                        ) : (
                          produtosFiltradosAutocomplete.map(p => (
                            <div 
                              key={p.id}
                              onClick={() => selecionarProdutoAutocomplete(p)}
                              className="p-2.5 text-xs text-slate-200 hover:bg-blue-600/30 cursor-pointer border-b border-slate-800/60 flex justify-between items-center"
                            >
                              <span className="font-semibold">{p.nome}</span>
                              <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{p.classificacao || 'Geral'}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Quantidade Encomendada</label>
                    <input 
                      type="number" 
                      value={qtdPedido} 
                      onChange={(e) => setQtdPedido(e.target.value)} 
                      className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-900 text-slate-100 text-sm outline-none focus:border-blue-500" 
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Data do Pedido</label>
                    <input 
                      type="date" 
                      value={dataPedidoInput} 
                      onChange={(e) => setDataPedidoInput(e.target.value)} 
                      className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-900 text-slate-100 text-sm outline-none focus:border-blue-500" 
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1">Previsão (Texto ou Datas)</label>
                    <input 
                      type="text" 
                      value={previsaoInput} 
                      onChange={(e) => setPrevisaoInput(e.target.value)} 
                      placeholder="Ex: 09/10/2026 até 12/10/2026"
                      className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-900 text-slate-100 text-sm outline-none focus:border-blue-500" 
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-end">
                    <button 
                      type="submit" 
                      disabled={salvandoPedido} 
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer shadow disabled:opacity-50"
                    >
                      {salvandoPedido ? 'A registar...' : '+ Registar Pedido em Trânsito'}
                    </button>
                  </div>
                </div>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <th className="p-3 w-10"></th>
                      <th className="p-3">Item Encomendado</th>
                      <th className="p-3 text-center">Qtd Total / Recebida</th>
                      <th className="p-3">Data Pedido</th>
                      <th className="p-3">Situação</th>
                      <th className="p-3">Previsão</th>
                      <th className="p-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {pedidosAtivos.length === 0 ? (
                      <tr><td colSpan={7} className="text-center p-6 text-slate-500">Nenhum pedido ativo no momento.</td></tr>
                    ) : (
                      pedidosAtivos.map((pedido) => {
                        const isExpandido = !!pedidosExpandidos[pedido.id];
                        const temParciais = pedido.entregas_parciais && pedido.entregas_parciais.length > 0;
                        const qtdTotal = pedido.quantidade_total;
                        const qtdRecebida = pedido.quantidade_recebida || 0;

                        const nomeProd = Array.isArray(pedido.produtos)
                          ? pedido.produtos[0]?.nome
                          : pedido.produtos?.nome;

                        const badgeStatus =
                          pedido.status === 'Parcialmente Recebido'
                            ? 'bg-blue-950/60 border-blue-800 text-blue-400'
                            : 'bg-amber-950/60 border-amber-800 text-amber-400';

                        return (
                          <React.Fragment key={pedido.id}>
                            <tr className="hover:bg-slate-800/40 transition-colors">
                              <td className="p-3 text-center">
                                {temParciais && (
                                  <button
                                    onClick={() => toggleExpandirPedido(pedido.id)}
                                    className="text-slate-400 hover:text-white font-mono text-xs p-1 cursor-pointer"
                                  >
                                    {isExpandido ? '▼' : '▶'}
                                  </button>
                                )}
                              </td>
                              <td className="p-3 font-semibold text-slate-100">{nomeProd || 'Produto Desconhecido'}</td>
                              <td className="p-3 text-center font-bold text-white whitespace-nowrap">
                                <span className="text-blue-400">{qtdTotal} un</span>
                                <span className="text-[10px] text-slate-400 font-normal block">(Recebido: {qtdRecebida})</span>
                              </td>
                              <td className="p-3 text-sm text-slate-300">{formatarData(pedido.data_pedido)}</td>
                              <td className="p-3">
                                <span className={`px-2.5 py-1 rounded border text-xs font-semibold ${badgeStatus}`}>
                                  {pedido.status}
                                </span>
                              </td>
                              <td className="p-3 text-sm text-slate-300">{pedido.previsao_entrega || '—'}</td>
                              <td className="p-3 text-center space-x-1.5 whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setPedidoSelecionadoRecebimento(pedido);
                                    setQuantidadeParcialReceber(String(qtdTotal - qtdRecebida));
                                    setModalRecebimentoAberto(true);
                                  }}
                                  className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900 text-blue-400 border border-blue-800/50 rounded text-xs font-semibold cursor-pointer"
                                >
                                  + Parcial
                                </button>
                                <button
                                  onClick={() => handleReceberTotalDireto(pedido)}
                                  className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/50 rounded text-xs font-semibold cursor-pointer"
                                >
                                  ✓ Recebido
                                </button>
                                <button
                                  onClick={() => handleCancelarPedido(pedido.id)}
                                  className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900 text-rose-400 border border-rose-800/50 rounded text-xs font-semibold cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </td>
                            </tr>

                            {isExpandido && temParciais && (
                              <tr className="bg-slate-950/70">
                                <td colSpan={7} className="p-3 pl-12">
                                  <div className="bg-slate-900/80 border border-slate-800 rounded p-3 space-y-2">
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                      Lotes / Entregas Parciais Registadas:
                                    </span>
                                    <div className="space-y-1">
                                      {pedido.entregas_parciais!.map((entrega) => (
                                        <div key={entrega.id} className="flex justify-between items-center text-xs text-slate-300 bg-slate-950/50 p-2 rounded border border-slate-800/50">
                                          <div>
                                            <span className="font-semibold text-emerald-400">+{entrega.quantidade_entregue} unidades</span>
                                            <span className="text-slate-400 ml-3">Data: {formatarData(entrega.data_recebimento)}</span>
                                          </div>
                                          <span className="text-slate-400 text-[11px]">{entrega.observacao || '—'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Formulário Adicionar Novo Produto */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <h2 className="text-lg font-semibold text-slate-200">Adicionar Novo Produto / Insumo</h2>
          <form onSubmit={handleAdicionarProduto} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Nome do Item</label>
              <input type="text" placeholder="Ex: Frascos 100ml" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Classificação</label>
              <select value={novaClassificacao} onChange={(e) => setNovaClassificacao(e.target.value)} className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none">
                {OPCOES_CLASSIFICACAO.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Estoque Atual / Mín.</label>
              <div className="flex gap-1">
                <input type="number" placeholder="Atual" value={novoEstoque} onChange={(e) => setNovoEstoque(e.target.value)} className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none text-center" />
                <input type="number" placeholder="Mín." value={novoEstoqueMinimo} onChange={(e) => setNovoEstoqueMinimo(e.target.value)} className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none text-center" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Prazo Min-Max (Dias Úteis)</label>
              <div className="flex gap-1">
                <input type="number" placeholder="Min" value={novoPrazoMin} onChange={(e) => setNovoPrazoMin(e.target.value)} className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none text-center" />
                <input type="number" placeholder="Max" value={novoPrazoMax} onChange={(e) => setNovoPrazoMax(e.target.value)} className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none text-center" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Preço Venda (R$)</label>
              <input type="number" step="0.01" value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none" />
            </div>
            <div className="sm:col-span-2 lg:col-span-7 flex justify-end">
              <button type="submit" disabled={salvandoNovo} className="px-5 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50">
                {salvandoNovo ? 'A validar e adicionar...' : '+ Adicionar Produto'}
              </button>
            </div>
          </form>
        </div>

        {/* Catálogo Atual e Filtros */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-200">
              Catálogo Atual ({produtosFiltrados.length} / {produtos.length} itens)
            </h2>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none">
                <option value="ativos">Apenas Ativos</option>
                <option value="inativos">Apenas Ocultos</option>
                <option value="todos">Todos (Ativos e Ocultos)</option>
              </select>
              <select value={filtroClassificacao} onChange={(e) => setFiltroClassificacao(e.target.value)} className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none">
                <option value="todas">Todas as Classificações</option>
                {OPCOES_CLASSIFICACAO.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
              </select>
              <input type="text" placeholder="Filtrar por nome..." value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)} className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none w-full sm:w-52" />
            </div>
          </div>

          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-950/50 rounded-lg border border-slate-800">Carregando catálogo...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Nome do Item</th>
                    <th className="p-3.5">Classificação</th>
                    <th className="p-3.5 text-center">Estoque Atual / Mín</th>
                    <th className="p-3.5 text-center">Prazo de Entrega</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtosFiltrados.map((prod) => {
                    const estaEditando = editandoId === prod.id;
                    const estaInativo = prod.ativo === false;
                    const atual = prod.estoque_atual ?? 0;
                    const minimo = prod.estoque_minimo ?? 0;
                    const pMin = prod.prazo_entrega_min ?? 0;
                    const pMax = prod.prazo_entrega_max ?? 0;
                    const prazoTexto = pMin === pMax ? `${pMin} dias úteis` : `${pMin} a ${pMax} dias úteis`;

                    return (
                      <tr key={prod.id} className={`hover:bg-slate-800/40 transition-colors ${estaInativo ? 'opacity-50 bg-slate-950/40' : ''}`}>
                        <td className="p-3.5 font-semibold text-slate-100">
                          {estaEditando ? <input type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} className="w-full p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none" /> : (
                            <div className="flex items-center gap-2">
                              <span>{prod.nome}</span>
                              {estaInativo && <span className="px-1.5 py-0.5 bg-rose-950 text-rose-400 border border-rose-800 text-[10px] rounded">Oculto</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5">
                          {estaEditando ? (
                            <select value={editClassificacao} onChange={(e) => setEditClassificacao(e.target.value)} className="w-full p-1.5 border border-blue-500 rounded bg-slate-950 text-white text-sm outline-none">
                              {OPCOES_CLASSIFICACAO.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                            </select>
                          ) : (
                            <span className="px-2.5 py-1 rounded border text-xs font-semibold bg-slate-800 border-slate-700 text-slate-300">{prod.classificacao || 'Produto Finalizado'}</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          {estaEditando ? (
                            <div className="flex gap-1 justify-center">
                              <input type="number" value={editEstoque} onChange={(e) => setEditEstoque(e.target.value)} className="w-16 p-1 border rounded bg-slate-950 text-white text-xs text-center" />
                              <input type="number" value={editEstoqueMinimo} onChange={(e) => setEditEstoqueMinimo(e.target.value)} className="w-16 p-1 border rounded bg-slate-950 text-white text-xs text-center" />
                            </div>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${atual <= minimo ? 'bg-amber-950 text-amber-300' : 'bg-emerald-950 text-emerald-400'}`}>
                              {atual} un (Mín: {minimo})
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center text-slate-300 text-xs font-medium">
                          {estaEditando ? (
                            <div className="flex gap-1 justify-center">
                              <input type="number" value={editPrazoMin} onChange={(e) => setEditPrazoMin(e.target.value)} className="w-14 p-1 border rounded bg-slate-950 text-white text-xs text-center" placeholder="Min" />
                              <input type="number" value={editPrazoMax} onChange={(e) => setEditPrazoMax(e.target.value)} className="w-14 p-1 border rounded bg-slate-950 text-white text-xs text-center" placeholder="Max" />
                            </div>
                          ) : (
                            prazoTexto
                          )}
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap space-x-1.5">
                          {estaEditando ? (
                            <>
                              <button onClick={() => salvarEdicao(prod.id)} className="px-2 py-1 bg-emerald-700 text-white rounded text-xs cursor-pointer">Salvar</button>
                              <button onClick={cancelarEdicao} className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-xs cursor-pointer">Cancelar</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => iniciarEdicao(prod)} className="px-2.5 py-1 bg-blue-950/60 text-blue-400 border border-blue-800/50 rounded text-xs font-semibold cursor-pointer">Editar</button>
                              <button onClick={() => alternarAtivo(prod.id, prod.ativo)} className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900 text-amber-400 border border-amber-800/50 rounded text-xs font-semibold cursor-pointer">
                                {prod.ativo !== false ? 'Ocultar' : 'Ativar'}
                              </button>
                              <button onClick={() => excluirProduto(prod.id, prod.nome)} className="px-2.5 py-1 bg-rose-950/60 text-rose-400 border border-rose-800/50 rounded text-xs font-semibold cursor-pointer">Excluir</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* MODAL DE HISTÓRICO DE PEDIDOS */}
      {modalHistoricoAberto && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-4xl space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">📜 Histórico de Pedidos (Concluídos e Cancelados)</h3>
                <p className="text-xs text-slate-400">Consulta de encomendas arquivadas e respetivos lotes entregues</p>
              </div>
              <button
                onClick={() => setModalHistoricoAberto(false)}
                className="text-slate-400 hover:text-white text-sm font-bold px-3 py-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3">
              {pedidosHistorico.length === 0 ? (
                <div className="text-center p-8 text-slate-500 text-sm">Nenhum pedido no histórico até ao momento.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <th className="p-3 w-10"></th>
                        <th className="p-3">Item Encomendado</th>
                        <th className="p-3 text-center">Qtd Total / Recebida</th>
                        <th className="p-3">Data Pedido</th>
                        <th className="p-3">Situação</th>
                        <th className="p-3">Previsão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {pedidosHistorico.map((pedido) => {
                        const isExpandido = !!historicoExpandidos[pedido.id];
                        const temParciais = pedido.entregas_parciais && pedido.entregas_parciais.length > 0;
                        const qtdTotal = pedido.quantidade_total;
                        const qtdRecebida = pedido.quantidade_recebida || 0;

                        const nomeProd = Array.isArray(pedido.produtos)
                          ? pedido.produtos[0]?.nome
                          : pedido.produtos?.nome;

                        const badgeStatus =
                          pedido.status === 'Recebido'
                            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                            : 'bg-rose-950/60 border-rose-800 text-rose-400';

                        return (
                          <React.Fragment key={pedido.id}>
                            <tr className="hover:bg-slate-800/40 transition-colors">
                              <td className="p-3 text-center">
                                {temParciais && (
                                  <button
                                    onClick={() => toggleExpandirHistorico(pedido.id)}
                                    className="text-slate-400 hover:text-white font-mono text-xs p-1 cursor-pointer"
                                  >
                                    {isExpandido ? '▼' : '▶'}
                                  </button>
                                )}
                              </td>
                              <td className="p-3 font-semibold text-slate-100">{nomeProd || 'Produto'}</td>
                              <td className="p-3 text-center font-bold text-white whitespace-nowrap">
                                <span className="text-blue-400">{qtdTotal} un</span>
                                <span className="text-[10px] text-slate-400 font-normal block">(Recebido: {qtdRecebida})</span>
                              </td>
                              <td className="p-3 text-sm text-slate-300">{formatarData(pedido.data_pedido)}</td>
                              <td className="p-3">
                                <span className={`px-2.5 py-1 rounded border text-xs font-semibold ${badgeStatus}`}>
                                  {pedido.status}
                                </span>
                              </td>
                              <td className="p-3 text-sm text-slate-300">{pedido.previsao_entrega || '—'}</td>
                            </tr>

                            {isExpandido && temParciais && (
                              <tr className="bg-slate-950/70">
                                <td colSpan={6} className="p-3 pl-12">
                                  <div className="bg-slate-900/80 border border-slate-800 rounded p-3 space-y-2">
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                      Lotes / Entregas Parciais Registadas:
                                    </span>
                                    <div className="space-y-1">
                                      {pedido.entregas_parciais!.map((entrega) => (
                                        <div key={entrega.id} className="flex justify-between items-center text-xs text-slate-300 bg-slate-950/50 p-2 rounded border border-slate-800/50">
                                          <div>
                                            <span className="font-semibold text-emerald-400">+{entrega.quantidade_entregue} unidades</span>
                                            <span className="text-slate-400 ml-3">Data: {formatarData(entrega.data_recebimento)}</span>
                                          </div>
                                          <span className="text-slate-400 text-[11px]">{entrega.observacao || '—'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalHistoricoAberto(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RECEBIMENTO PARCIAL */}
      {modalRecebimentoAberto && pedidoSelecionadoRecebimento && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Registar Recebimento Parcial</h3>
            <p className="text-xs text-slate-400">
              Pendente: <span className="text-emerald-400 font-bold">{pedidoSelecionadoRecebimento.quantidade_total - (pedidoSelecionadoRecebimento.quantidade_recebida || 0)} unidades</span>
            </p>

            <form onSubmit={handleConfirmarRecebimentoParcial} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Quantidade a Receber Agora</label>
                <input
                  type="number"
                  min="1"
                  value={quantidadeParcialReceber}
                  onChange={(e) => setQuantidadeParcialReceber(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-emerald-400 font-bold text-base outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Data do Recebimento</label>
                <input
                  type="date"
                  value={dataRecebimentoParcial}
                  onChange={(e) => setDataRecebimentoParcial(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Observação do Lote</label>
                <input
                  type="text"
                  value={obsRecebimentoParcial}
                  onChange={(e) => setObsRecebimentoParcial(e.target.value)}
                  placeholder="Ex: Entrega parcial via transportadora..."
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalRecebimentoAberto(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold cursor-pointer shadow-sm"
                >
                  Confirmar Recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
