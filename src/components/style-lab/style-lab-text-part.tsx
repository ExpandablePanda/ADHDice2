"use client";

import { Children, cloneElement, Fragment, isValidElement, type ReactNode } from "react";

function renderTextParts(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      return child.toString().trim().length > 0
        ? <span data-style-text-part="label">{child}</span>
        : child;
    }

    if (isValidElement(child) && (child.type === Fragment || typeof child.type === "string")) {
      const childProps = child.props as { children?: ReactNode };
      if (childProps.children !== undefined) {
        return cloneElement(child, undefined, renderTextParts(childProps.children));
      }
    }

    return child;
  });
}

export function StyleLabTextPart({ children }: { children: ReactNode }) {
  return <>{renderTextParts(children)}</>;
}
