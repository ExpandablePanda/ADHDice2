export type FitnessReloadScope<Client> = {
  active: boolean;
  client: Client | null;
  userId: string | null;
};

export type FitnessReloadRequest<Client> = FitnessReloadScope<Client> & {
  generation: number;
};

export function isCurrentFitnessReloadRequest<Client>(
  request: FitnessReloadRequest<Client>,
  currentScope: FitnessReloadScope<Client>,
  currentGeneration: number,
) {
  return request.generation === currentGeneration
    && request.active
    && currentScope.active
    && request.client !== null
    && currentScope.client === request.client
    && request.userId !== null
    && currentScope.userId === request.userId;
}
