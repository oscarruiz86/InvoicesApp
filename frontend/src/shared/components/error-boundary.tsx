import { Component, type ReactNode } from 'react';
import { Alert, Button, Container, Stack } from '@mui/material';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Container sx={{ py: 6 }}><Stack spacing={2}>
      <Alert severity="error">No fue posible mostrar esta pantalla.</Alert>
      <Button onClick={() => window.location.reload()}>Recargar aplicación</Button>
    </Stack></Container>;
    return this.props.children;
  }
}
