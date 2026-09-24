'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function criarProduto(formData: FormData) {
  const nome = formData.get('nome') as string;
  const sku = formData.get('sku') as string;
  const preco_custo = Number(formData.get('preco_custo')) || 0;
  const preco_venda = Number(formData.get('preco_venda')) || 0;
  const estoque_atual = Number(formData.get('estoque_atual')) || 0;
  const estoque_minimo = Number(formData.get('estoque_minimo')) || 0;
  const categoria = formData.get('categoria') as string;

  const { error } = await supabase.from('produtos').insert([
    { nome, sku, preco_custo, preco_venda, estoque_atual, estoque_minimo, categoria },
  ]);

  if (error) {
    console.error('Erro ao criar produto:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/estoque');
  return { success: true };
}

export async function excluirProduto(id: string) {
  const { error } = await supabase.from('produtos').delete().eq('id', id);

  if (error) {
    console.error('Erro ao excluir produto:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/estoque');
  return { success: true };
}

export async function movimentarEstoque(produtoId: string, quantidade: number, tipo: 'entrada' | 'saida') {
  const { data: produto, error: errBusca } = await supabase
    .from('produtos')
    .select('estoque_atual')
    .eq('id', produtoId)
    .single();

  if (errBusca || !produto) {
    return { success: false, error: 'Produto não encontrado' };
  }

  const estoqueAtual = Number(produto.estoque_atual) || 0;
  const novoEstoque = tipo === 'entrada' ? estoqueAtual + quantidade : estoqueAtual - quantidade;

  const { error: errUpdate } = await supabase
    .from('produtos')
    .update({ estoque_atual: novoEstoque })
    .eq('id', produtoId);

  if (errUpdate) {
    return { success: false, error: errUpdate.message };
  }

  revalidatePath('/estoque');
  return { success: true };
}