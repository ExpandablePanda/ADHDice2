"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { TASK_TABLE_CHIP_BASE_CLASS, TASK_TABLE_CONTROL_FONT_CLASS } from "@/components/ui/task-table-primitives";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import { StyleLabIconPreviewSlot } from "./style-lab-icon-slot";
import {
  collectStyleLabMockHosts,
  getStyleLabMockSectionHostKey,
  STYLE_LAB_MOCK_HOST_ATTRIBUTE,
  STYLE_LAB_MOCK_ID_ATTRIBUTE,
} from "./style-lab-mock-registry";
import type { StyleLabMockDraft, StyleLabMockHost, StyleLabMockNode } from "./style-lab-mock-types";

const MOCK_SURFACE_CLASS = "border border-[#e7e1f5] bg-white/90 text-[#403a54] shadow-[0_8px_24px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/85";
const MOCK_MUTED_TEXT_CLASS = "text-[#7d7598] dark:text-white/55";

function MockChip({ hidden, node }: { hidden: boolean; node: StyleLabMockNode }) {
  return (
    <span
      data-style-lab-mock-node="chip"
      data-style-lab-mock-id={node.id}
      data-style-lab-hidden={hidden ? "true" : undefined}
    >
      <span
        className={`${TASK_TABLE_CONTROL_FONT_CLASS} inline-flex shrink-0 items-center appearance-none border-0 bg-transparent p-0 shadow-none`}
        data-style-component="StyleLabMockChip"
        data-style-role="mock.chip"
      >
        <span className={`${TASK_TABLE_CHIP_BASE_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`} data-style-part="surface">
          <span className="inline-flex items-center gap-1.5" data-style-part="label">
            <StyleLabIconPreviewSlot iconName={node.icon ?? "plus"}>
              <TaskTypeIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" iconKey={node.icon ?? "plus"} />
            </StyleLabIconPreviewSlot>
            <span data-style-text-part="label">{node.text}</span>
          </span>
        </span>
      </span>
    </span>
  );
}

function MockItem({ hidden, node }: { hidden: boolean; node: StyleLabMockNode }) {
  return (
    <article
      className={`${MOCK_SURFACE_CLASS} min-w-0 rounded-xl px-3 py-2.5`}
      data-style-component="StyleLabMockItem"
      data-style-lab-mock-node="item"
      data-style-lab-mock-id={node.id}
      data-style-lab-hidden={hidden ? "true" : undefined}
      data-style-role="mock.item.surface"
    >
      <h3 className="text-sm font-semibold" data-style-component="StyleLabMockItem" data-style-role="mock.item.title" data-style-text-part="label">{node.text}</h3>
      {node.subtitle ? <p className={`mt-1 text-xs ${MOCK_MUTED_TEXT_CLASS}`} data-style-component="StyleLabMockItem" data-style-role="mock.item.subtitle" data-style-text-part="label">{node.subtitle}</p> : null}
    </article>
  );
}

function MockSection({ hidden, node }: { hidden: boolean; node: StyleLabMockNode }) {
  const hostKey = getStyleLabMockSectionHostKey(node.id);
  return (
    <section
      className={`${MOCK_SURFACE_CLASS} min-w-0 rounded-2xl p-3`}
      data-style-component="StyleLabMockSection"
      data-style-lab-mock-node="section"
      data-style-lab-mock-id={node.id}
      data-style-lab-hidden={hidden ? "true" : undefined}
      data-style-role="mock.section.surface"
    >
      <header>
        <h3 className="text-sm font-semibold" data-style-component="StyleLabMockSection" data-style-role="mock.section.title" data-style-text-part="label">{node.text}</h3>
        {node.subtitle ? <p className={`mt-1 text-xs ${MOCK_MUTED_TEXT_CLASS}`} data-style-component="StyleLabMockSection" data-style-role="mock.section.subtitle" data-style-text-part="label">{node.subtitle}</p> : null}
      </header>
      <div
        className="mt-3 flex min-w-0 flex-wrap items-start gap-2 rounded-xl border border-dashed border-[#dcd3f2] p-2 dark:border-white/15"
        data-style-component="StyleLabMockSection"
        data-style-lab-mock-owner-id={node.id}
        data-style-lab-mock-host-label={`Mock Section · ${node.text}`}
        data-style-role="mock.section.body"
        {...{ [STYLE_LAB_MOCK_HOST_ATTRIBUTE]: hostKey }}
      />
    </section>
  );
}

function MockNode({ hidden, node }: { hidden: boolean; node: StyleLabMockNode }) {
  if (node.type === "chip") return <MockChip hidden={hidden} node={node} />;
  if (node.type === "item") return <MockItem hidden={hidden} node={node} />;
  return <MockSection hidden={hidden} node={node} />;
}

function hostsMatch(left: StyleLabMockHost[], right: StyleLabMockHost[]) {
  return left.length === right.length && left.every((host, index) => host.key === right[index]?.key && host.element === right[index]?.element);
}

export function StyleLabMockRuntime({ draft }: { draft: StyleLabMockDraft }) {
  const [hosts, setHosts] = useState<StyleLabMockHost[]>([]);

  useEffect(() => {
    const refreshHosts = () => {
      const nextHosts = collectStyleLabMockHosts(document);
      setHosts((current) => hostsMatch(current, nextHosts) ? current : nextHosts);
    };
    refreshHosts();
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(refreshHosts);
    observer?.observe(document.body, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, [draft.nodes]);

  const hiddenKeys = new Set(draft.hiddenTargets.map((target) => target.key));
  return (
    <>
      {hosts.flatMap((host) => draft.nodes
        .filter((node) => node.parentHostKey === host.key)
        .sort((left, right) => left.order - right.order)
        .map((node) => createPortal(
          <MockNode hidden={hiddenKeys.has(`mock:${node.id}`)} node={node} />,
          host.element,
          `${host.key}:${node.id}`,
        )))}
    </>
  );
}

export { STYLE_LAB_MOCK_ID_ATTRIBUTE };
