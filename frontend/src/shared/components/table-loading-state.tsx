import { LinearProgress, Skeleton, TableCell, TableRow } from '@mui/material';

const skeletonWidths = [72, 44, 58, 66, 38, 52];

export function TableLoadingState({ columns, rows = 5, label = 'Cargando registros' }: {
  readonly columns: number;
  readonly rows?: number;
  readonly label?: string;
}) {
  return <>
    <TableRow>
      <TableCell colSpan={columns} sx={{ p: 0, border: 0 }}>
        <LinearProgress aria-label={label} />
      </TableCell>
    </TableRow>
    {Array.from({ length: rows }, (_value, row) => <TableRow key={row} aria-hidden="true">
      {Array.from({ length: columns }, (_cell, column) => <TableCell key={column} sx={{ py: 1.75 }}>
        <Skeleton animation="wave" variant="text" width={`${skeletonWidths[column % skeletonWidths.length]}%`} height={24} />
      </TableCell>)}
    </TableRow>)}
  </>;
}
