import { useEffect, useState, type ReactNode } from 'react';
import { AppBar, Box, Drawer, IconButton, Stack, Toolbar, Typography, useMediaQuery, useTheme } from '@mui/material';

const drawerWidth = 228;

export function AppLayout({ children, navigation, account }: { children: ReactNode; navigation?: ReactNode; account?: ReactNode }) {
  const theme = useTheme(); const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(desktop);
  useEffect(() => { setOpen(desktop); }, [desktop]);
  const navigationPanel = (closeAfterSelection = false) => <Stack component="nav" aria-label="Navegación principal" spacing={.5}
    onClick={closeAfterSelection ? event => {
      if (event.target instanceof Element && event.target.closest('a[href]')) setOpen(false);
    } : undefined}
    sx={{ p: 1.5, bgcolor: '#f8fafc', minHeight: '100%' }}>{navigation}</Stack>;
  return <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
    <Box component="a" href="#main-content" sx={{ position: 'absolute', left: -10000, top: 8, zIndex: 1400, p: 1.5, bgcolor: 'background.paper', color: 'primary.main', borderRadius: 1, '&:focus': { left: 8, outline: '3px solid #1d4ed8' } }}>Saltar al contenido</Box>
    <AppBar position="sticky" elevation={0} color="transparent" sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Toolbar sx={{ gap: 1, minHeight: { xs: 62, md: 66 }, px: { xs: 2, md: 2.5 }, py: { xs: 1.25, md: 1.5 }, boxSizing: 'border-box' }}>
        <IconButton aria-label={open ? 'Ocultar navegación' : 'Abrir navegación'} onClick={() => setOpen(value => !value)} sx={{ width: 42, height: 42, p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Box component="span" aria-hidden="true" sx={{ fontSize: 24, lineHeight: 1 }}>☰</Box>
        </IconButton>
        <Typography sx={{ flexGrow: 1, fontWeight: 800, color: 'primary.main' }}>Invoices App</Typography>
        {account}
      </Toolbar>
    </AppBar>
      <Drawer variant="temporary" open={open && !desktop} onClose={() => setOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}>
      {navigationPanel(true)}
    </Drawer>
    <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
      {open && desktop && <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, position: 'relative', boxSizing: 'border-box', borderRight: '1px solid', borderColor: 'divider' } }}>
        {navigationPanel()}
      </Drawer>}
      <Box id="main-content" component="main" sx={{ minWidth: 0, flexGrow: 1, px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2, md: 3 } }}>{children}</Box>
    </Box>
    <Box component="footer" sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, mt: 2 }}><Typography variant="caption" color="text.secondary">Invoices App</Typography></Box>
  </Box>;
}
