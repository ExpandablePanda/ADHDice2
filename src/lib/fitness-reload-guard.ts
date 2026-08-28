export type FitnessReloadScope<Client> = {
  active: boolean;
  client: Client | null;
  userId: string | null;
};

export type FitnessReloadRequest<Client> = FitnessReloadScope<Client> & {
  generation: number;
};

export function isCurrentFitnessScope<Client>(
  requestScope: FitnessReloadScope<Client>,
  currentScope: FitnessReloadScope<Client>,
) {
  return requestScope.active
    && currentScope.active
    && requestScope.client !== null
    && currentScope.client === requestScope.client
    && requestScope.userId !== null
    && currentScope.userId === requestScope.userId;
}

export function isCurrentFitnessReloadRequest<Client>(
  request: FitnessReloadRequest<Client>,
  currentScope: FitnessReloadScope<Client>,
  currentGeneration: number,
) {
  return request.generation === currentGeneration
    && isCurrentFitnessScope(request, currentScope);
}
