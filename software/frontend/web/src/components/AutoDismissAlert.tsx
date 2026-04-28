import React, { useEffect, useState } from 'react';
import { Alert, AlertProps, Collapse } from '@mui/material';

type AutoDismissAlertProps = AlertProps & {
  open: boolean;
  autoHideDuration?: number;
  onCloseAlert?: () => void;
};

const AutoDismissAlert: React.FC<AutoDismissAlertProps> = ({
  open,
  autoHideDuration = 5000,
  onCloseAlert,
  children,
  ...alertProps
}) => {
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    setVisible(open);
  }, [open, children]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, autoHideDuration);

    return () => window.clearTimeout(timeoutId);
  }, [autoHideDuration, open, children]);

  return (
    <Collapse
      in={open && visible}
      timeout={320}
      unmountOnExit
      onExited={onCloseAlert}
    >
      <Alert
        {...alertProps}
        onClose={() => {
          setVisible(false);
        }}
      >
        {children}
      </Alert>
    </Collapse>
  );
};

export default AutoDismissAlert;
