import type { StyleLabIconName, StyleLabRoleId } from "@/components/style-lab/style-lab-registry";

export const STYLE_LAB_MOCK_NODE_TYPES = ["chip", "item", "section"] as const;
export type StyleLabMockNodeType = (typeof STYLE_LAB_MOCK_NODE_TYPES)[number];

export type StyleLabMockNode = {
  id: string;
  type: StyleLabMockNodeType;
  parentHostKey: string;
  order: number;
  text: string;
  subtitle?: string;
  icon?: StyleLabIconName;
};

export const STYLE_LAB_HIDDEN_TARGET_KINDS = ["page-shell", "panel", "card", "tasks-rail-chip", "mock"] as const;
export type StyleLabHiddenTargetKind = (typeof STYLE_LAB_HIDDEN_TARGET_KINDS)[number];

export type StyleLabHiddenTarget = {
  key: string;
  kind: StyleLabHiddenTargetKind;
  stable: boolean;
  roleId: StyleLabRoleId;
  label: string;
  context: string;
};

export type StyleLabMockDraft = {
  nodes: StyleLabMockNode[];
  hiddenTargets: StyleLabHiddenTarget[];
};

export const STYLE_LAB_MOCK_HOST_KINDS = ["page-shell-body", "tasks-rail", "mock-section-body"] as const;
export type StyleLabMockHostKind = (typeof STYLE_LAB_MOCK_HOST_KINDS)[number];

export type StyleLabMockHost = {
  key: string;
  kind: StyleLabMockHostKind;
  label: string;
  context: string;
  allowedTypes: readonly StyleLabMockNodeType[];
  element: HTMLElement;
};

export type StyleLabStructuralTarget = {
  key: string;
  kind: StyleLabHiddenTargetKind;
  stable: boolean;
  roleId: StyleLabRoleId;
  label: string;
  context: string;
  element: HTMLElement;
  mockId?: string;
};

export type StyleLabStructuralProposal =
  | {
    action: "hide";
    context: string;
    label: string;
    roleId: StyleLabRoleId;
    target: string;
  }
  | {
    action: "add";
    context: string;
    node: StyleLabMockNode;
    parent: string;
    position: number;
    siblingCount: number;
  };
