'use server';

import { createClient } from '@/utils/supabase/server'; // Ajuste o caminho se o seu helper do supabase estiver noutra pasta (ex: '@/lib/supabase/server')
import { revalidatePath } from 'next/cache';

export async function criarProduto(formData: FormData) {
  const supabase = await createClient();

  const nome = formData.get('nome') as string;
  const sku = formData.get('sku') as string;
  const categoria = formData.get('categoria') as string;
  const preco_custo = parseFloat(formData.get('preco_custo') as string) || 0;
  const preco_venda = parseFloat(formData.get('preco_venda') as string) || 0;
  const estoque_atual = parseInt(formData.get('estoque_atual') as string) || 0;
  const estoque_minimo = parseInt(formData.get('estoque_minimo') as string) || 0;

  const { error } = await supabase.from('produtos').insert([
    {
      nome,
      sku,
      categoria,
      preco_custo,
      preco_venda,
      estoque_atual,
      estoque_minimo,
    },
  ]);

  if (error) {
    console.error('Erro ao inserir produto no Supabase:', error.message);
    return { success: false, error: error.message };
  }

  revalidatePath('/estoque');
  return { success: true };
}

export async function excluirProduto(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from('produtos').delete().eq('id', id);

  if (error) {
    console.error('Erro ao excluir produto no Supabase:', error.message);
    return { success: false, error: error.message };
  }

  revalidatePath('/estoque');
  return { success: true };
}