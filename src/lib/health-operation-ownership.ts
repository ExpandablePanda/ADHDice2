export type HealthOperationOwner = {
  active: boolean;
  generation: number;
  userId: string | null;
};

export type HealthOperationToken = {
  generation: number;
  userId: string;
};

export function captureHealthOperation(owner: HealthOperationOwner): HealthOperationToken | null {
  if (!owner.active || !owner.userId) return null;
  return { generation: owner.generation, userId: owner.userId };
}

export function isCurrentHealthOperation(owner: HealthOperationOwner, token: HealthOperationToken | null) {
  return Boolean(
    token
    && owner.active
    && owner.userId === token.userId
    && owner.generation === token.generation,
  );
}
