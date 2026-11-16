import type { ServiceKind } from '@/domain/programs/contract';

export const SERVICE_LABELS: Record<ServiceKind, string> = {
  personal_training: 'Personal training',
  mesocycle: 'Mesocycle programming',
  nutrition: 'Nutritional programming',
};

/** Compact labels for dense views such as the client table. */
export const SERVICE_SHORT_LABELS: Record<ServiceKind, string> = {
  personal_training: 'Personal training',
  mesocycle: 'Mesocycle',
  nutrition: 'Nutrition',
};

export const SERVICES =Object.keys(SERVICE_LABELS) as ServiceKind[];

/** Client sections each service unlocks (PRD §6: hide unavailable sections). */
export function clientSections(services: ServiceKind[]) {
  const training = services.includes('personal_training') || services.includes('mesocycle');
  const nutrition = services.includes('nutrition');
  return { training, nutrition, progress: training || nutrition };
}
