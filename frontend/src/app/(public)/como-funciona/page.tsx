import type { Metadata } from 'next';
import { GuiaInteractiva } from '@/features/guia/components/GuiaInteractiva';

export const metadata: Metadata = {
  title: '¿Cómo funciona?',
};

/**
 * US-24: guía de uso paso a paso. PUBLICA: está pensada para quien llega por
 * primera vez, antes de crear su cuenta. Se enlaza desde el menú principal,
 * la cuenta del ciudadano y la portada.
 */
export default function ComoFuncionaPage() {
  return <GuiaInteractiva />;
}
