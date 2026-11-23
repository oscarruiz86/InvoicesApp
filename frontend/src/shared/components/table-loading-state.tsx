import { Fragment } from 'react';
import { LinearProgress, Skeleton, TableCell, TableRow } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';

const skeletonWidths = [72, 44, 58, 66, 38, 52];

type LoadingLayout = {
  readonly columns: number;
  readonly rowSx?: SystemStyleObject<Theme>;
  readonly columnSx?: readonly SystemStyleObject<Theme>[];
};

export function TableLoadingState({ columns, rows = 5, label = 'Cargando registros', columnSx = [], responsiveLayouts }: {
  readonly columns: number;
  readonly rows?: number;
  readonly label?: string;
  readonly columnSx?: readonly SystemStyleObject<Theme>[];
  readonly responsiveLayouts?: readonly LoadingLayout[];
}) {
  const layouts = responsiveLayouts ?? [{ columns, columnSx }];
  return layouts.map((layout, layoutIndex) => <Fragment key={layoutIndex}>
    <TableRow sx={layout.rowSx}>
      <TableCell colSpan={layout.columns} sx={{ p: 0, border: 0, bgcolor: 'background.paper' }}>
        <LinearProgress aria-label={label} sx={{ height: 3 }} />
      </TableCell>
    </TableRow>
    {Array.from({ length: rows }, (_value, row) => <TableRow key={row} aria-hidden="true" sx={layout.rowSx}>
      {Array.from({ length: layout.columns }, (_cell, column) => <TableCell key={column} sx={{ height: 52, py: 1.25, borderColor: 'divider', ...layout.columnSx?.[column] }}>
        <Skeleton animation="wave" variant="rounded" width={`${skeletonWidths[column % skeletonWidths.length]}%`} height={14} sx={{ borderRadius: 999, bgcolor: 'action.hover' }} />
      </TableCell>)}
    </TableRow>)}
  </Fragment>);
}
