import { useId } from 'react';
import { FormControl, IconButton, InputLabel, MenuItem, Pagination, Select, Stack, SvgIcon, Typography } from '@mui/material';

/** Pagination controls for APIs that expose an opaque next/previous cursor instead of totals. */
export function CursorPagination({ page, pageSize, itemCount, pageSizeOptions = [20,50,100], hasNext, disabled = false,
  onPageChange, onPageSizeChange, onRefresh, label = 'Paginación de registros', refreshLabel = 'Actualizar listado' }: {
  readonly page: number; readonly pageSize: number; readonly itemCount: number; readonly pageSizeOptions?: readonly number[]; readonly hasNext: boolean;
  readonly disabled?: boolean; readonly onPageChange: (page:number) => void; readonly onPageSizeChange: (pageSize:number) => void;
  readonly onRefresh: () => void; readonly label?: string; readonly refreshLabel?: string;
}) {
  const id = useId();
  const count = page + (hasNext ? 1 : 0);
  const start = itemCount ? (page - 1) * pageSize + 1 : 0;
  const end = start ? start + itemCount - 1 : 0;
  return <Stack component="nav" aria-label={label} direction={{xs:'column',sm:'row'}} spacing={{xs:1,sm:1.25}} useFlexGap sx={{
    width:'100%',minWidth:0,alignItems:{xs:'stretch',sm:'center'},justifyContent:'space-between',flexWrap:'wrap',mt:2,py:.5,
  }}>
    <Stack direction="row" spacing={.5} sx={{minWidth:0,maxWidth:'100%',alignItems:'center',flexWrap:'wrap'}}>
      <Pagination count={count} page={Math.min(page,count)} boundaryCount={1} siblingCount={1} showFirstButton showLastButton disabled={disabled}
        onChange={(_event,nextPage)=>onPageChange(nextPage)} aria-label={label}
        getItemAriaLabel={(type,itemPage,selected)=>type==='first'?'Ir a la primera página disponible':type==='last'?'Ir a la última página disponible':type==='next'?'Ir a la página siguiente':type==='previous'?'Ir a la página anterior':selected?`Página ${itemPage}, actual`:`Ir a la página ${itemPage}`}
        sx={{
          '& .MuiPaginationItem-root':{boxSizing:'border-box',minWidth:{xs:32,sm:36},height:{xs:32,sm:36},px:{xs:.25,sm:.5},mx:.125,border:'1px solid #64748b',borderRadius:'8px',bgcolor:'#fff',color:'#17233a',fontSize:{xs:13,sm:14},lineHeight:1,'& .MuiSvgIcon-root':{fontSize:{xs:18,sm:20}},'&:hover':{bgcolor:'#e8effe'},'&.Mui-selected,&[aria-current="page"]':{bgcolor:'#e8effe',color:'#153d8e',fontWeight:700},'&.Mui-selected:hover,&[aria-current="page"]:hover':{bgcolor:'#e8effe'},'&.Mui-focusVisible':{outline:'3px solid #1d4ed8',outlineOffset:2},'&.Mui-disabled':{color:'#94a3b8',borderColor:'#cbd5e1',bgcolor:'#fff'}},
          '& .MuiPagination-ul':{flexWrap:'wrap',gap:.25},'& .MuiPaginationItem-ellipsis':{minWidth:24,border:0,bgcolor:'transparent'},
        }} />
      <IconButton aria-label={refreshLabel} title={refreshLabel} onClick={onRefresh} disabled={disabled} sx={{width:36,height:36,flexShrink:0,border:'1px solid #64748b',borderRadius:'8px',color:'#17233a','&:hover':{bgcolor:'#e8effe'},'&.Mui-focusVisible':{outline:'3px solid #1d4ed8',outlineOffset:2}}}>
        <SvgIcon fontSize="small" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.93 9h-2.02A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" /></SvgIcon>
      </IconButton>
    </Stack>
    <Stack direction="row" spacing={1.5} useFlexGap sx={{minWidth:0,flexWrap:'wrap',alignItems:'center',justifyContent:{xs:'space-between',sm:'flex-start'}}}>
      <Typography aria-live="polite" sx={{color:'#475569',fontSize:13,whiteSpace:{xs:'normal',sm:'nowrap'}}}>Registros {start}–{end}</Typography>
      <FormControl size="small" sx={{minWidth:{xs:120,sm:136},'& .MuiOutlinedInput-root':{height:36,minHeight:36,borderRadius:'8px',bgcolor:'#fff'},'& .MuiOutlinedInput-notchedOutline':{borderColor:'#64748b'},'& .MuiSelect-select':{py:0,pl:1,pr:3.5,minHeight:'unset',display:'flex',alignItems:'center',color:'#17233a',fontSize:13}}}>
      <InputLabel id={`${id}-page-size-label`} sx={{color:'#475569',fontSize:12}}>Registros por página</InputLabel>
      <Select labelId={`${id}-page-size-label`} value={pageSize} label="Registros por página" disabled={disabled} onChange={event=>onPageSizeChange(Number(event.target.value))}>
        {pageSizeOptions.map(size=><MenuItem key={size} value={size}>{size}</MenuItem>)}
      </Select>
      </FormControl>
    </Stack>
  </Stack>;
}
