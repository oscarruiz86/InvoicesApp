import { useEffect, useRef, type ReactNode } from 'react';
import { Alert } from '@mui/material';

type SuccessNoticeProps = {
  children: ReactNode;
  onClose: () => void;
  timeoutMs?: number;
};

export function SuccessNotice({ children, onClose, timeoutMs = 5000 }: SuccessNoticeProps) {
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (timeoutMs <= 0) return undefined;
    const timeout = window.setTimeout(() => onCloseRef.current(), timeoutMs);
    return () => window.clearTimeout(timeout);
  }, [children, timeoutMs]);

  return <Alert severity="success" onClose={onClose}>{children}</Alert>;
}
