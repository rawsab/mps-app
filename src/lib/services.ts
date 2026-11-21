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

export const SERVICES = Object.keys(SERVICE_LABELS) as ServiceKind[];

/** Client sections each service unlocks (PRD §6: hide unavailable sections). */
export function clientSections(services: ServiceKind[]) {
  const mesocycle = services.includes('mesocycle');
  const personalTraining = services.includes('personal_training');
  const nutrition = services.includes('nutrition');
  return { mesocycle, personalTraining, nutrition, progress: mesocycle || personalTraining || nutrition };
}

export type ClientSection = keyof ReturnType<typeof clientSections>;

const SERVICE_PATHS: Record<ServiceKind, string> = { mesocycle: '/mesocycle', personal_training: '/personal-training', nutrition: '/nutrition' };

/** The client route for a service's section, or for one of its programs. */
export function clientProgramPath(service: ServiceKind, programId?: string | null) {
  return programId ? `${SERVICE_PATHS[service]}/${programId}` : SERVICE_PATHS[service];
}
