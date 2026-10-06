export type VoiceMemoScopeToken = {
  generation: number;
  userId: string | null;
};

export class VoiceMemoScopeFence {
  private scope: VoiceMemoScopeToken;

  constructor(userId: string | null) {
    this.scope = { generation: 0, userId };
  }

  syncUser(userId: string | null) {
    if (this.scope.userId !== userId) {
      this.scope = { generation: this.scope.generation + 1, userId };
    }
    return this.scope;
  }

  capture() {
    return this.scope;
  }

  isCurrent(token: VoiceMemoScopeToken) {
    return token.generation === this.scope.generation && token.userId === this.scope.userId;
  }
}
