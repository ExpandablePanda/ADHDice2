"use client";

import { useCallback, useEffect, useState } from "react";

type UseResponsiveTaskGridColumnsOptions = {
  maxColumns: number;
  phoneColumns: number;
  tabletColumns: number;
};

export function useResponsiveTaskGridColumns({
  maxColumns,
  phoneColumns,
  tabletColumns,
}: UseResponsiveTaskGridColumnsOptions) {
  const getColumns = useCallback(() => {
    if (typeof window === "undefined") {
      return maxColumns;
    }

    if (window.innerWidth >= 1280) {
      return maxColumns;
    }

    if (window.innerWidth >= 768) {
      return tabletColumns;
    }

    return phoneColumns;
  }, [maxColumns, phoneColumns, tabletColumns]);

  const [columns, setColumns] = useState(getColumns);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => setColumns(getColumns());
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getColumns]);

  return columns;
}
